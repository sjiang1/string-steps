// Repoints checklist item images in the committed seed to the /api/img/<id> proxy.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { needsMigration, proxyPathFor } from "./checklist-migration.mjs";

const path = join(process.cwd(), "data/checklist-items.json");
const items = JSON.parse(readFileSync(path, "utf-8"));
for (const item of items) {
  if (needsMigration(item)) item.image = proxyPathFor(item);
}
writeFileSync(path, JSON.stringify(items, null, 2) + "\n");
console.log(`Rewrote ${path}`);
