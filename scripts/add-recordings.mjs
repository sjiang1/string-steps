// Dry-run:  node --env-file=.env.local scripts/add-recordings.mjs
// Execute:  node --env-file=.env.local scripts/add-recordings.mjs --execute
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Redis } from "@upstash/redis";
import { put } from "@vercel/blob";
import { trackFromFilename } from "./recordings.mjs";

const EXECUTE = process.argv.includes("--execute");
const RECORDINGS_DIR = join(process.cwd(), "recordings");

async function main() {
  const { KV_REST_API_URL, KV_REST_API_TOKEN, BLOB_READ_WRITE_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN || !BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "KV_REST_API_URL, KV_REST_API_TOKEN, BLOB_READ_WRITE_TOKEN must be set " +
        "(run with: node --env-file=.env.local scripts/add-recordings.mjs)",
    );
  }

  const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });
  const tracks = (await redis.get("tracks:list")) ?? [];
  const blobs = (await redis.get("tracks:blobs")) ?? {};
  const existingIds = new Set(tracks.map((t) => t.id));

  const files = readdirSync(RECORDINGS_DIR)
    .filter((f) => !f.startsWith("."))
    .sort();

  console.log(
    `${files.length} files in recordings/; mode=${EXECUTE ? "EXECUTE" : "DRY-RUN"}`,
  );

  const toAdd = [];
  for (const file of files) {
    const track = trackFromFilename(file); // throws on unknown extension
    if (existingIds.has(track.id)) {
      console.log(`- skip ${track.id} (already in tracks:list)`);
      continue;
    }
    console.log(`- add  ${track.id} -> blob ${track.blobPathname} (${track.contentType})`);
    toAdd.push({ file, track });
  }

  console.log(`\n${toAdd.length} to add; ${files.length - toAdd.length} skipped.`);

  if (!EXECUTE) {
    console.log("DRY-RUN complete. Re-run with --execute to upload + write Redis.");
    return;
  }

  for (const { file, track } of toAdd) {
    const data = readFileSync(join(RECORDINGS_DIR, file));
    const { url } = await put(track.blobPathname, data, {
      access: "public",
      token: BLOB_READ_WRITE_TOKEN,
      contentType: track.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    blobs[track.id] = url;
    tracks.push({ id: track.id, name: track.name, type: track.type, file: track.file });
    console.log(`  uploaded ${track.id} -> ${url}`);
  }

  await redis.set("tracks:blobs", blobs);
  await redis.set("tracks:list", tracks);
  console.log(`\nWrote tracks:blobs and tracks:list (${toAdd.length} added).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
