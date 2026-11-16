// Repoints audio/video entries in the committed seed to the /api/v/<id> proxy.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { needsMigration, proxyPathFor } from "./media-migration.mjs";

const path = join(process.cwd(), "data/tracks.json");
// data/tracks.json is an object keyed by track id (mirrors the track:all hash).
const tracks = JSON.parse(readFileSync(path, "utf-8"));
for (const track of Object.values(tracks)) {
  if (needsMigration(track)) track.file = proxyPathFor(track);
}
writeFileSync(path, JSON.stringify(tracks, null, 2) + "\n");
console.log(`Rewrote ${path}`);
