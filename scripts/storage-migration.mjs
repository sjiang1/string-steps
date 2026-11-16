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
