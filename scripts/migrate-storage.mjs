// One-step migration from one-JSON-value-per-key to per-record hashes and sets
// (#44). Dry run by default; --execute writes.
//
//   node --env-file=.env.local scripts/migrate-storage.mjs            # dry run
//   node --env-file=.env.local scripts/migrate-storage.mjs --execute  # write
//
// Old keys are never written or deleted. Every write is HSETNX or SADD, so the
// script never overwrites an entry that already exists under a new key and can
// be run again after the deploy to pick up anything the old code wrote in
// between. plan:next-id is set only when the computed maximum is higher.
// Exits non-zero if any new key holds fewer entries than the old one after
// writing. See docs/superpowers/specs/2026-11-16-record-per-key-storage-design.md.
import { Redis } from "@upstash/redis";
import {
  KEY_MAP,
  newPracticeKey,
  newNotesKey,
  normalizeTapKeys,
  entriesById,
  maxNumericId,
  planHash,
  planSet,
} from "./storage-migration.mjs";

const EXECUTE = process.argv.includes("--execute");
async function readOld(redis, key) {
  const raw = await redis.get(key);
  return raw === null || raw === undefined ? null : JSON.parse(raw);
}

async function main() {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    throw new Error(
      "KV_REST_API_URL and KV_REST_API_TOKEN must be set " +
        "(run with: node --env-file=.env.local scripts/migrate-storage.mjs)",
    );
  }
  const redis = new Redis({
    url: KV_REST_API_URL,
    token: KV_REST_API_TOKEN,
    automaticDeserialization: false,
  });

  const plans = [];
  const absent = [];
  let planIds = null;

  // Whole-collection keys → one hash each.
  for (const [oldKey, newKey] of Object.entries(KEY_MAP)) {
    const value = await readOld(redis, oldKey);
    if (value === null) {
      absent.push(oldKey);
      continue;
    }
    if (Array.isArray(value)) {
      const { entries, duplicates } = entriesById(value);
      const fields = Object.fromEntries(
        Object.entries(entries).map(([id, record]) => [id, JSON.stringify(record)]),
      );
      const notes = duplicates.length ? `duplicate ids (first kept): ${duplicates.join(", ")}` : "";
      plans.push(await planHash(redis, oldKey, newKey, fields, notes));
      if (oldKey === "plans:list") planIds = Object.keys(entries);
    } else {
      const fields = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)]));
      plans.push(await planHash(redis, oldKey, newKey, fields, ""));
    }
  }

  // Practice log: one set per day.
  for (const oldKey of (await redis.keys("practice:*")).sort()) {
    const value = await readOld(redis, oldKey);
    if (!Array.isArray(value)) continue;
    const { members, normalized } = normalizeTapKeys(value);
    const notes = normalized.length ? `suffixed: ${normalized.join(", ")}` : "";
    plans.push(await planSet(redis, oldKey, newPracticeKey(oldKey), members, notes));
  }

  // Notes: one hash per date.
  for (const oldKey of (await redis.keys("notes:*")).sort()) {
    const value = await readOld(redis, oldKey);
    if (value === null || typeof value !== "object") continue;
    const fields = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)]));
    plans.push(await planHash(redis, oldKey, newNotesKey(oldKey), fields, ""));
  }

  // Plan id counter.
  let counterLine = "plan:next-id: plans:list absent, counter untouched";
  let counterApply = null;
  if (planIds !== null) {
    const max = maxNumericId(planIds);
    const currentRaw = await redis.get("plan:next-id");
    const current = currentRaw === null || currentRaw === undefined ? null : Number(currentRaw);
    if (current === null || max > current) {
      counterLine = `plan:next-id: ${current === null ? "absent" : current} -> ${max}`;
      counterApply = () => redis.set("plan:next-id", String(max));
    } else {
      counterLine = `plan:next-id: ${current} (already >= ${max}, untouched)`;
    }
  }

  // Report.
  console.log(`mode=${EXECUTE ? "EXECUTE" : "DRY-RUN"}\n`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("old key", 28) + pad("new key", 24) + pad("type", 6) + pad("total", 7) + pad("write", 7) + pad("present", 9) + "notes");
  const totals = { hash: 0, set: 0, write: 0, present: 0 };
  for (const p of plans) {
    console.log(pad(p.oldKey, 28) + pad(p.newKey, 24) + pad(p.type, 6) + pad(p.total, 7) + pad(p.write, 7) + pad(p.present, 9) + p.notes);
    totals[p.type]++;
    totals.write += p.write;
    totals.present += p.present;
  }
  console.log(`\n${totals.hash} hashes, ${totals.set} sets; ${totals.write} entries to write, ${totals.present} already present.`);
  if (absent.length) console.log(`absent old keys (skipped): ${absent.join(", ")}`);
  console.log(counterLine);

  if (!EXECUTE) {
    console.log("\nDRY-RUN complete. Re-run with --execute to write the new keys (old keys are left as they are).");
    return;
  }

  // Write and verify.
  for (const p of plans) await p.apply();
  if (counterApply) await counterApply();
  const failed = [];
  for (const p of plans) if (!(await p.verify())) failed.push(p.newKey);
  if (failed.length) {
    console.error(`\nREAD-BACK FAILED for: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`\nWrote ${totals.write} entries; every new key holds at least as many entries as its old key.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
