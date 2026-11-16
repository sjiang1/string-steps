// Dry-run:  node --env-file=.env.local scripts/add-recordings.mjs
// Execute:  node --env-file=.env.local scripts/add-recordings.mjs --execute
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Redis } from "@upstash/redis";
import { put } from "@vercel/blob";
import { planRecordings } from "./recordings.mjs";
import { hashReplyToRecord } from "./storage-migration.mjs";

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

  const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN, automaticDeserialization: false });
  // track:all and track:blob are hashes; Track objects are JSON strings.
  const tracks = Object.values(hashReplyToRecord(await redis.hgetall("track:all"))).map((s) => JSON.parse(s));
  const existingIds = new Set(tracks.map((t) => t.id));

  const files = readdirSync(RECORDINGS_DIR);
  const { toAdd, skipped } = planRecordings(files, existingIds);

  console.log(
    `${files.length} files in recordings/; mode=${EXECUTE ? "EXECUTE" : "DRY-RUN"}`,
  );
  for (const { file, reason } of skipped) console.log(`- skip ${file} (${reason})`);
  for (const { track } of toAdd) {
    console.log(`- add  ${track.id} -> blob ${track.blobPathname} (${track.contentType})`);
  }

  console.log(`\n${toAdd.length} to add; ${skipped.length} skipped.`);

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
    const entry = { id: track.id, name: track.name, type: track.type, file: track.file };
    await redis.hset("track:blob", { [track.id]: url });
    await redis.hset("track:all", { [track.id]: JSON.stringify(entry) });
    console.log(`  uploaded ${track.id} -> ${url}; written to track:blob + track:all`);
  }

  console.log(`\n${toAdd.length} added to track:all and track:blob.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
