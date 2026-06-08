// Audit + re-encode teacher-demo videos so every served video streams cleanly.
//
// Dry-run (audit):  node --env-file=.env.local scripts/reencode-videos.mjs
// Execute (fix):    node --env-file=.env.local scripts/reencode-videos.mjs --execute
//
// Why: iOS uploads (via the Shortcut) can land non-faststart and/or high-bitrate
// (see #26) and stutter. The ffmpeg recipe (~1.2 Mbps, faststart) streams fine.
// This tool ffprobes EVERY video in tracks:blobs, flags any that are non-faststart
// or over the bitrate ceiling, and (on --execute) re-encodes just those with the
// standard recipe and swaps them on Blob.
//
// Stopgap until on-device encoding produces streaming-ready files directly (#32).
//
// Cache-safe swap: Blob caches by pathname (cache-control 30 days), so the
// re-encoded file goes to a NEW pathname (videos/<id>.mp4); we repoint tracks:blobs
// and delete the old object. New URL => no stale CDN/browser cache.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Redis } from "@upstash/redis";
import { put, del } from "@vercel/blob";

const EXECUTE = process.argv.includes("--execute");

// A served video must stream cleanly: faststart (moov at front) and a sane
// bitrate. The ffmpeg recipe yields ~1.2 Mbps; the bad iOS files were 5.5–11.5.
export const BITRATE_CEILING = 2_500_000;

export function needsReencode({ faststart, bitrate }) {
  if (!faststart) return true;
  if (typeof bitrate === "number" && bitrate > BITRATE_CEILING) return true;
  return false;
}

// Mirrors the README ffmpeg recipe, but caps height at 720 WITHOUT upscaling
// smaller sources (min(720,ih)). The comma in min() is escaped for ffmpeg's
// filtergraph parser since this is passed as a single argv element.
export function ffmpegArgs(inPath, outPath) {
  return [
    "-y", "-loglevel", "error",
    "-i", inPath,
    "-vcodec", "libx264", "-crf", "28", "-preset", "medium",
    "-vf", "scale=-2:min(720\\,ih)",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    outPath,
  ];
}

// New, cache-busting pathname. If the video already lives at the target path
// (e.g. a prior re-encode), add a suffix so the URL still changes.
export function newPathnameFor(id, oldPathname) {
  const target = `videos/${id}.mp4`;
  return target === oldPathname ? `videos/${id}-reencoded.mp4` : target;
}

function atomsAreFaststart(buf) {
  let o = 0;
  const seq = [];
  while (o + 8 <= buf.length && seq.length < 8) {
    let size = buf.readUInt32BE(o);
    const type = buf.toString("latin1", o + 4, o + 8);
    if (!/^[ -~]{4}$/.test(type)) break;
    seq.push(type);
    if (size === 1) {
      if (o + 16 > buf.length) break;
      size = Number(buf.readBigUInt64BE(o + 8));
    }
    if (size < 8) break;
    o += size;
  }
  const m = seq.indexOf("moov");
  const d = seq.indexOf("mdat");
  return m > -1 && (d < 0 || m < d);
}

async function inspectVideo(url) {
  // faststart: read the first 256 KB and check moov-vs-mdat order
  const res = await fetch(url, { headers: { Range: "bytes=0-262143" } });
  const head = Buffer.from(await res.arrayBuffer());
  const faststart = atomsAreFaststart(head);
  // bitrate: ffprobe reads the remote moov (small for faststart; tail otherwise)
  let bitrate = null;
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=bit_rate", "-of", "default=nokey=1:noprint_wrappers=1", url],
      { encoding: "utf8" },
    ).trim();
    const n = parseInt(out, 10);
    if (Number.isFinite(n)) bitrate = n;
  } catch {
    /* leave bitrate null — faststart alone may still flag it */
  }
  return { faststart, bitrate };
}

async function main() {
  const { KV_REST_API_URL, KV_REST_API_TOKEN, BLOB_READ_WRITE_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN || !BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "KV_REST_API_URL, KV_REST_API_TOKEN, BLOB_READ_WRITE_TOKEN must be set " +
        "(run with: node --env-file=.env.local scripts/reencode-videos.mjs)",
    );
  }
  const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });
  const tracks = (await redis.get("tracks:list")) ?? [];
  const blobs = (await redis.get("tracks:blobs")) ?? {};
  const videos = tracks.filter((t) => t.type === "video" && blobs[t.id]);
  const dir = mkdtempSync(join(tmpdir(), "reencode-"));
  console.log(`mode=${EXECUTE ? "EXECUTE" : "DRY-RUN (audit)"}  videos=${videos.length}`);

  const flagged = [];
  for (const t of videos) {
    const { faststart, bitrate } = await inspectVideo(blobs[t.id]);
    const mbps = bitrate ? (bitrate / 1e6).toFixed(1) + "Mbps" : "?";
    const flag = needsReencode({ faststart, bitrate });
    console.log(
      `- ${t.id}: ${faststart ? "faststart" : "NOT-faststart"}, ${mbps}` +
        ` => ${flag ? "RE-ENCODE" : "ok"}`,
    );
    if (flag) flagged.push(t);
  }

  if (flagged.length === 0) {
    console.log("\nAll videos conform (faststart + ≤2.5 Mbps). Nothing to do.");
    return;
  }
  console.log(`\n${flagged.length} video(s) need re-encoding: ${flagged.map((t) => t.id).join(", ")}`);

  for (const t of flagged) {
    const oldUrl = blobs[t.id];
    const oldPathname = new URL(oldUrl).pathname.replace(/^\/+/, "");
    const newPathname = newPathnameFor(t.id, oldPathname);
    const inPath = join(dir, `${t.id}.in.mp4`);
    const outPath = join(dir, `${t.id}.out.mp4`);

    execFileSync("curl", ["-sL", oldUrl, "-o", inPath]);
    execFileSync("ffmpeg", ffmpegArgs(inPath, outPath));
    const beforeMB = (statSync(inPath).size / 1e6).toFixed(1);
    const afterMB = (statSync(outPath).size / 1e6).toFixed(1);
    console.log(`- ${t.id}: ${oldPathname} (${beforeMB}MB) -> ${newPathname} (${afterMB}MB)`);

    if (!EXECUTE) continue;

    const data = readFileSync(outPath);
    const { url: newUrl } = await put(newPathname, data, {
      access: "public",
      token: BLOB_READ_WRITE_TOKEN,
      contentType: "video/mp4",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    blobs[t.id] = newUrl;
    await redis.set("tracks:blobs", blobs);
    if (newPathname !== oldPathname) await del(oldUrl, { token: BLOB_READ_WRITE_TOKEN });
    console.log(`  uploaded -> ${newUrl}; redis updated; deleted old ${oldPathname}`);
  }

  if (!EXECUTE) {
    console.log("\nDRY-RUN: re-encoded locally only. Re-run with --execute to swap on Blob.");
  } else {
    console.log("\nDone. Flagged videos re-encoded and swapped.");
  }
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith("reencode-videos.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
