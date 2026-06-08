// Run dry-run:  node --env-file=.env.local scripts/migrate-checklist-images.mjs
// Execute:      node --env-file=.env.local scripts/migrate-checklist-images.mjs --execute
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Redis } from "@upstash/redis";
import { put } from "@vercel/blob";
import {
  needsMigration,
  contentTypeFor,
  localPathFor,
  blobPathnameFor,
} from "./checklist-migration.mjs";

const EXECUTE = process.argv.includes("--execute");
const PUBLIC_DIR = join(process.cwd(), "public");
const ITEMS_PATH = join(process.cwd(), "data/checklist-items.json");

async function main() {
  const { KV_REST_API_URL, KV_REST_API_TOKEN, BLOB_READ_WRITE_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN || !BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "KV_REST_API_URL, KV_REST_API_TOKEN, BLOB_READ_WRITE_TOKEN must be set " +
        "(run with: node --env-file=.env.local scripts/migrate-checklist-images.mjs)",
    );
  }

  const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });
  const items = JSON.parse(readFileSync(ITEMS_PATH, "utf-8"));
  const blobs = (await redis.get("checklist:blobs")) ?? {};
  const toMigrate = items.filter(needsMigration);

  console.log(
    `${items.length} checklist items total; ${toMigrate.length} to migrate; ` +
      `mode=${EXECUTE ? "EXECUTE" : "DRY-RUN"}`,
  );

  for (const item of toMigrate) {
    const pathname = blobPathnameFor(item);
    const contentType = contentTypeFor(item.image);
    console.log(`- ${item.id}: ${item.image} -> blob ${pathname} (${contentType})`);
    if (!EXECUTE) continue;

    const data = readFileSync(localPathFor(item, PUBLIC_DIR));
    const { url } = await put(pathname, data, {
      access: "public",
      token: BLOB_READ_WRITE_TOKEN,
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    blobs[item.id] = url;
    console.log(`  uploaded -> ${url}`);
  }

  if (!EXECUTE) {
    console.log("\nDRY-RUN complete. Re-run with --execute to write Blob + Redis.");
    return;
  }

  await redis.set("checklist:blobs", blobs);
  console.log("\nWrote checklist:blobs to Redis.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
