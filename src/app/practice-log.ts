// done:<logId> — the tap keys a student has done on one day, as a Redis set.
// Each tap key carries its own repetition index (see task-keys.ts), so members
// are unique and order never matters. logId is doneLogId(student, date). In dev
// every day lives under its own slot of data/practice-log.json.
import { dataPath, setAdd, setMembers, setRemove, type FileRef } from "./storage";

export function doneKey(logId: string): string {
  return `done:${logId}`;
}

const fileFor = (logId: string): FileRef => ({
  path: dataPath("PRACTICE_LOG_PATH", "practice-log.json"),
  slot: logId,
});

export async function getDone(logId: string): Promise<string[]> {
  return setMembers(doneKey(logId), fileFor(logId));
}

// Adds the tap key, or removes it when it was already there. Returns the day's
// full list afterwards, which is what TaskList renders from.
export async function toggleDone(logId: string, tapKey: string): Promise<string[]> {
  const key = doneKey(logId);
  const file = fileFor(logId);
  const added = await setAdd(key, file, tapKey);
  if (!added) await setRemove(key, file, tapKey);
  return setMembers(key, file);
}
