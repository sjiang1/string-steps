// Audit + re-encode teacher-demo videos so every served video streams cleanly.
//
// Dry-run (audit):  node --env-file=.env.local scripts/reencode-videos.mjs
// Execute (fix):    node --env-file=.env.local scripts/reencode-videos.mjs --execute
//
// Why: iOS uploads (via the Shortcut) can land non-faststart and/or high-bitrate
// and stutter. The ffmpeg recipe (~1.2 Mbps, faststart) streams fine. Since #31,
// POST /api/tracks re-encodes every upload automatically and shows a ⚠️ next to
// the video until that has succeeded; this script is the manual fallback. It
// ffprobes EVERY video in track:blob, flags any that are non-faststart or over
// the bitrate ceiling, (on --execute) re-encodes just those with the same recipe
// and swaps them on Blob, and clears a stuck ⚠️ (the track:reencode mark) for
// every video that conforms afterwards. Marks are cleared one field at a time
// (HDEL), never by writing the map back, so an upload that arrives mid-run
// keeps its mark.
//
// Cache-safe swap: Blob caches by pathname (cache-control 30 days), so the
// re-encoded file goes to a NEW pathname (videos/<id>.mp4); we repoint track:blob
// and delete the old object. New URL => no stale CDN/browser cache.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Redis } from "@upstash/redis";
import { put, del } from "@vercel/blob";
import { needsReencode, ffmpegArgs, newPathnameFor, atomsAreFaststart } from "./video-recipe.mjs";
import { hashReplyToRecord } from "./storage-migration.mjs";

const EXECUTE = process.argv.includes("--execute");

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
  const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN, automaticDeserialization: false });
  // track:all and track:blob are hashes; Track objects are JSON strings.
  const tracks = Object.values(hashReplyToRecord(await redis.hgetall("track:all"))).map((s) => JSON.parse(s));
  const blobs = hashReplyToRecord(await redis.hgetall("track:blob"));
  // Only the field names matter here: which videos still carry a ⚠️.
  const marks = hashReplyToRecord(await redis.hgetall("track:reencode"));
  const videos = tracks.filter((t) => t.type === "video" && blobs[t.id]);
  async function clearMark(id) {
    if (!Object.hasOwn(marks, id)) return;
    if (EXECUTE) {
      await redis.hdel("track:reencode", id);
      console.log(`  cleared mark: ${id}`);
    } else {
      console.log(`  would clear mark: ${id}`);
    }
  }
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
    else await clearMark(t.id);
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
    await redis.hset("track:blob", { [t.id]: newUrl });
    await clearMark(t.id);
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
