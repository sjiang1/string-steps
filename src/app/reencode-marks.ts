// track:reencode — track id → { since, error? } for videos whose re-encode
// after a Shortcut upload has not finished yet (#31). A Redis hash: the upload
// route, the job and scripts/reencode-videos.mjs each touch one field, so none
// can erase another's mark. Dev: data/track-reencode.json, same shape.
import {
  dataPath,
  hashDelete,
  hashGetAll,
  hashSet,
  jsonCodec,
  type FileRef,
} from "./storage";

export type ReencodeMark = { since: string; error?: string };

const MARKS_KEY = "track:reencode";
const codec = jsonCodec<ReencodeMark>();
const fileRef = (): FileRef => ({
  path: dataPath("TRACK_REENCODE_JSON_PATH", "track-reencode.json"),
});

function isMark(value: unknown): value is ReencodeMark {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { since?: unknown }).since === "string"
  );
}

// The ⚠️ is an aid: a hand-broken store (file holding a string, a field holding
// junk, a Redis key of the wrong type) must never take a page down, so this
// returns only well-formed marks and {} when the read itself fails.
export async function getReencodeMarks(): Promise<Record<string, ReencodeMark>> {
  let raw: unknown;
  try {
    raw = await hashGetAll<unknown>(MARKS_KEY, fileRef(), jsonCodec<unknown>());
  } catch (err) {
    console.error("track:reencode could not be read; showing no ⚠️ marks", err);
    return {};
  }
  const out: Record<string, ReencodeMark> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw)) if (isMark(value)) out[id] = value;
  return out;
}

export async function markReencoding(id: string, now: Date = new Date()): Promise<void> {
  await hashSet(MARKS_KEY, fileRef(), codec, id, { since: now.toISOString() });
}

// Only the video's own job writes its field, so read-then-write here has no
// second writer.
export async function recordReencodeError(id: string, message: string): Promise<void> {
  const existing = (await getReencodeMarks())[id];
  const since = existing?.since ?? new Date().toISOString();
  await hashSet(MARKS_KEY, fileRef(), codec, id, { since, error: message });
}

export async function clearReencodeMark(id: string): Promise<void> {
  await hashDelete(MARKS_KEY, fileRef(), id);
}
