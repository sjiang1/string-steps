// Run dry-run:  node --env-file=.env.local scripts/migrate-media.mjs
// Execute:      node --env-file=.env.local scripts/migrate-media.mjs --execute
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Redis } from "@upstash/redis";
import { put } from "@vercel/blob";
import {
  needsMigration,
  contentTypeFor,
  localPathFor,
  blobPathnameFor,
  proxyPathFor,
} from "./media-migration.mjs";

const EXECUTE = process.argv.includes("--execute");
const PUBLIC_DIR = join(process.cwd(), "public");

async function main() {
  const { KV_REST_API_URL, KV_REST_API_TOKEN, BLOB_READ_WRITE_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN || !BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "KV_REST_API_URL, KV_REST_API_TOKEN, BLOB_READ_WRITE_TOKEN must be set " +
        "(run with: node --env-file=.env.local scripts/migrate-media.mjs)",
    );
  }

  const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN, automaticDeserialization: false });
  // track:all and track:blob are hashes; Track objects are JSON strings.
  const tracks = Object.values((await redis.hgetall("track:all")) ?? {}).map((s) => JSON.parse(s));
  const toMigrate = tracks.filter(needsMigration);

  console.log(
    `${tracks.length} tracks total; ${toMigrate.length} to migrate; ` +
      `mode=${EXECUTE ? "EXECUTE" : "DRY-RUN"}`,
  );

  for (const track of toMigrate) {
    const pathname = blobPathnameFor(track);
    const contentType = contentTypeFor(track.file);
    console.log(`- ${track.id}: ${track.file} -> blob ${pathname} (${contentType})`);
    if (!EXECUTE) continue;

    const data = readFileSync(localPathFor(track, PUBLIC_DIR));
    const { url } = await put(pathname, data, {
      access: "public",
      token: BLOB_READ_WRITE_TOKEN,
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    track.file = proxyPathFor(track);
    await redis.hset("track:blob", { [track.id]: url });
    await redis.hset("track:all", { [track.id]: JSON.stringify(track) });
    console.log(`  uploaded -> ${url}; written to track:blob + track:all`);
  }

  if (!EXECUTE) {
    console.log("\nDRY-RUN complete. Re-run with --execute to write Blob + Redis.");
    return;
  }

  console.log(`\n${toMigrate.length} track(s) written to track:all and track:blob.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
