// note:<date> — track id → the parent's note for that track on that day, as a
// Redis hash. In dev every date lives under its own slot of data/notes-log.json
// and a day with no notes left is removed from the file.
import { dataPath, hashDelete, hashGetAll, hashSet, stringCodec, type FileRef } from "./storage";

const noteKey = (date: string) => `note:${date}`;
const fileFor = (date: string): FileRef => ({
  path: dataPath("NOTES_LOG_PATH", "notes-log.json"),
  slot: date,
});

export async function getNotes(date: string): Promise<Record<string, string>> {
  return hashGetAll(noteKey(date), fileFor(date), stringCodec);
}

// Trims the note; an empty result deletes the entry.
export async function setNote(date: string, trackId: string, note: string): Promise<void> {
  const trimmed = note.trim();
  if (trimmed === "") await hashDelete(noteKey(date), fileFor(date), trackId);
  else await hashSet(noteKey(date), fileFor(date), stringCodec, trackId, trimmed);
}
