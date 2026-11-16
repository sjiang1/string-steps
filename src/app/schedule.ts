// schedule:day — calendar date → plan id or day-type id, as a Redis hash.
// Values are plain strings ("0" is a plan id, "individual-class" a day type),
// so they go through stringCodec and never get parsed as numbers. Empty in
// Redis on a fresh deployment, so data/plan-schedule.json seeds it; in dev that
// file is the store.
import scheduleData from "@data/plan-schedule.json";
import type { PlanSchedule } from "./plans";
import {
  dataPath,
  hashDelete,
  hashSeedIfEmpty,
  hashSet,
  hashSetIfAbsent,
  stringCodec,
  type FileRef,
} from "./storage";

const SCHEDULE_KEY = "schedule:day";
const fileRef = (): FileRef => ({ path: dataPath("SCHEDULE_JSON_PATH", "plan-schedule.json") });

export async function getScheduleMap(): Promise<PlanSchedule> {
  return hashSeedIfEmpty(SCHEDULE_KEY, fileRef(), stringCodec, scheduleData as PlanSchedule);
}

export async function setScheduleEntry(date: string, value: string): Promise<void> {
  await hashSet(SCHEDULE_KEY, fileRef(), stringCodec, date, value);
}

// HSETNX: true when written, false when the date already had a value.
export async function setScheduleEntryIfAbsent(date: string, value: string): Promise<boolean> {
  return hashSetIfAbsent(SCHEDULE_KEY, fileRef(), stringCodec, date, value);
}

export async function deleteScheduleEntry(date: string): Promise<void> {
  await hashDelete(SCHEDULE_KEY, fileRef(), date);
}

// Writes only the dates whose value differs between `before` and `after`, so a
// pure function that returns a whole new schedule (applyActiveFrom) still ends
// up touching one field per changed day.
export async function writeScheduleDiff(before: PlanSchedule, after: PlanSchedule): Promise<void> {
  for (const [date, value] of Object.entries(after)) {
    if (before[date] !== value) await setScheduleEntry(date, value);
  }
}
