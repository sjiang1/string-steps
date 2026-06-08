import { isNonPracticeDay } from "../day-types";
import type { PlanSchedule } from "../plans";

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function isPracticeDay(schedule: PlanSchedule, date: string): boolean {
  const value = schedule[date];
  return value === undefined || !isNonPracticeDay(value);
}

// First practice day on or after `date` (skips explicitly-marked non-practice days).
export function firstPracticeDayOnOrAfter(schedule: PlanSchedule, date: string): string {
  let d = date;
  while (!isPracticeDay(schedule, d)) d = addDays(d, 1);
  return d;
}

// Default "active from": today if it's an un-practiced practice day, else the next practice day.
export function defaultActiveFrom(
  schedule: PlanSchedule,
  today: string,
  todayHasLog: boolean,
): string {
  if (isPracticeDay(schedule, today) && !todayHasLog) return today;
  return firstPracticeDayOnOrAfter(schedule, addDays(today, 1));
}

// Anchor `planId` at `activeFrom` (assumed a practice day >= today) and remap every existing
// future practice entry after it; earlier days, past days, and non-practice days are untouched.
export function applyActiveFrom(
  schedule: PlanSchedule,
  planId: string,
  activeFrom: string,
): PlanSchedule {
  const next: PlanSchedule = { ...schedule };
  for (const [date, value] of Object.entries(schedule)) {
    if (date > activeFrom && !isNonPracticeDay(value)) next[date] = planId;
  }
  next[activeFrom] = planId;
  return next;
}
