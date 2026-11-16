// Pure transforms for scripts/migrate-storage.mjs: old one-JSON-value-per-key
// shapes → the per-record hashes and sets described in
// docs/superpowers/specs/2026-11-16-record-per-key-storage-design.md.
// No I/O here so the rules can be unit-tested.

// Whole-collection keys whose new key is a hash.
export const KEY_MAP = {
  "tracks:list": "track:all",
  "tracks:blobs": "track:blob",
  "plans:list": "plan:all",
  "schedule:map": "schedule:day",
};

export function newPracticeKey(oldKey) {
  return oldKey.replace(/^practice:/, "done:");
}

export function newNotesKey(oldKey) {
  return oldKey.replace(/^notes:/, "note:");
}

// Every tap key must end in "-<repIndex>"; the app used to add "-0" to legacy
// members at read time. Returns the unique, suffixed members plus the list of
// members that needed the suffix.
export function normalizeTapKeys(members) {
  const normalized = [];
  const out = [];
  const seen = new Set();
  for (const m of members) {
    let key = m;
    if (!/-\d+$/.test(m)) {
      key = `${m}-0`;
      normalized.push(m);
    }
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return { members: out, normalized };
}

// Keys an array of records by `id`. The first entry wins, matching how the app
// looked records up (`find`); later duplicates are reported.
export function entriesById(array) {
  const entries = {};
  const duplicates = [];
  for (const record of array) {
    if (record.id in entries) {
      if (!duplicates.includes(record.id)) duplicates.push(record.id);
      continue;
    }
    entries[record.id] = record;
  }
  return { entries, duplicates };
}

// Highest numeric id, or -1 when there is none; the counter's starting value.
export function maxNumericId(ids) {
  let max = -1;
  for (const id of ids) {
    const n = parseInt(id, 10);
    if (!isNaN(n) && String(n) === id && n > max) max = n;
  }
  return max;
}

// With automaticDeserialization off, @upstash/redis returns HGETALL as a flat
// [field, value, field, value, …] array and [] for a missing key (the pairs →
// object step was part of the deserializer that got switched off). Same rule
// as hashReplyToRecord in src/app/storage.ts; mirrored here so the scripts
// import nothing from the app.
export function hashReplyToRecord(raw) {
  if (Array.isArray(raw)) {
    const out = {};
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
    return out;
  }
  return raw ?? {};
}

// --- Planned writes. These take a Redis client so they can run against the
// test double; nothing here reads the environment.

const PIPELINE_CHUNK = 100;

// One hash to fill: `fields` are field → encoded string. Writes only the
// fields not already present (HSETNX), never overwriting.
export async function planHash(redis, oldKey, newKey, fields, notes) {
  const existing = hashReplyToRecord(await redis.hgetall(newKey));
  const toWrite = Object.keys(fields).filter((f) => !(f in existing));
  return {
    oldKey,
    newKey,
    type: "hash",
    total: Object.keys(fields).length,
    write: toWrite.length,
    present: Object.keys(fields).length - toWrite.length,
    notes,
    apply: async () => {
      for (let i = 0; i < toWrite.length; i += PIPELINE_CHUNK) {
        const chunk = toWrite.slice(i, i + PIPELINE_CHUNK);
        if (typeof redis.pipeline === "function") {
          const p = redis.pipeline();
          for (const f of chunk) p.hsetnx(newKey, f, fields[f]);
          await p.exec();
        } else {
          for (const f of chunk) await redis.hsetnx(newKey, f, fields[f]);
        }
      }
    },
    verify: async () =>
      Object.keys(hashReplyToRecord(await redis.hgetall(newKey))).length >= Object.keys(fields).length,
  };
}

// One set to fill: SADD only the members not already present.
export async function planSet(redis, oldKey, newKey, members, notes) {
  const existing = new Set((await redis.smembers(newKey)) ?? []);
  const toWrite = members.filter((m) => !existing.has(m));
  return {
    oldKey,
    newKey,
    type: "set",
    total: members.length,
    write: toWrite.length,
    present: members.length - toWrite.length,
    notes,
    apply: async () => {
      if (toWrite.length > 0) await redis.sadd(newKey, ...toWrite);
    },
    verify: async () => ((await redis.smembers(newKey)) ?? []).length >= members.length,
  };
}
