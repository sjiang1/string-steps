import { practicePlanIdOn, type Plan, type PlanSchedule, type PlanTask, type PracticeItem } from "./plans";
import type { Student } from "./students";
import { doneCountForTask } from "./task-keys";

// How far back the Practice page reads the log to rank a rotating item's tracks.
// A track not finished within this window counts as never finished (first in line).
export const ROTATION_LOOKBACK_DAYS = 30;

// A rotating item practices `perDay` of its pool each day. Hand-edited plans can
// hold bad values, so anything invalid is treated as a normal item.
export function isRotating(item: PracticeItem): boolean {
  const n = item.perDay;
  return (
    n !== undefined &&
    Number.isInteger(n) &&
    n >= 1 &&
    n < item.trackChoices.length &&
    !item.dice
  );
}

// Every task done exactly to its count — the point TaskList shows ✅ (see #26).
export function trackFullyDone(trackId: string, tasks: PlanTask[], done: string[]): boolean {
  return tasks.length > 0 && tasks.every((t) => doneCountForTask(trackId, t, done) === t.count);
}

// One past day of a student's log, with the plan that was scheduled that day.
export type HistoryDay = { date: string; done: string[]; plan?: Plan };

// Attaches to each logged day the plan the student practiced from that day,
// including a linked account's class-day fallback, so each day is judged by
// what it actually asked for.
export function historyWithPlans(
  history: { date: string; done: string[] }[],
  schedule: PlanSchedule,
  plans: Plan[],
  student: Student,
): HistoryDay[] {
  return history.map((h) => {
    const planId = practicePlanIdOn(h.date, schedule, student);
    return { ...h, plan: plans.find((p) => p.id === planId) };
  });
}

// A past day is judged by the tasks that day's plan asked for, so a task-list
// change in a new plan doesn't restart the rotation.
function tasksOn(day: HistoryDay, trackId: string, fallback: PlanTask[]): PlanTask[] {
  return day.plan?.items.find((i) => i.trackChoices.includes(trackId))?.tasks ?? fallback;
}

export function lastFullyDoneDate(
  trackId: string,
  item: PracticeItem,
  history: HistoryDay[],
): string | null {
  let last: string | null = null;
  for (const day of history) {
    if (last !== null && day.date <= last) continue;
    if (trackFullyDone(trackId, tasksOn(day, trackId, item.tasks), day.done)) last = day.date;
  }
  return last;
}

// The perDay tracks that waited longest: never-finished first, then oldest
// finish; ties keep pool order. `history` must hold only days before today.
export function suggestTracks(item: PracticeItem, history: HistoryDay[]): string[] {
  const ranked = item.trackChoices.map((id, index) => ({
    id,
    index,
    last: lastFullyDoneDate(id, item, history),
  }));
  ranked.sort((a, b) => {
    if (a.last !== b.last) {
      if (a.last === null) return -1;
      if (b.last === null) return 1;
      return a.last < b.last ? -1 : 1;
    }
    return a.index - b.index;
  });
  return ranked.slice(0, item.perDay).map((r) => r.id);
}

// Tracks finished today, capped at perDay — extra tracks don't overfill the item.
export function tracksDoneToday(item: PracticeItem, done: string[]): number {
  const full = item.trackChoices.filter((id) => trackFullyDone(id, item.tasks, done)).length;
  return Math.min(full, item.perDay ?? 0);
}

export function daysAgoLabel(last: string | null, today: string): string {
  if (last === null) return "not yet";
  const days = Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000);
  return days === 1 ? "✓ yesterday" : `✓ ${days} days ago`;
}

// Calendar progress for a rotating item, one unit per finished task (#26): the
// perDay tracks with the most finished tasks count, capped at perDay × tasks.
export function rotatingItemProgress(
  item: PracticeItem,
  done: string[],
): { done: number; total: number } {
  const perDay = item.perDay ?? 0;
  const total = perDay * item.tasks.length;
  const finishedPerTrack = item.trackChoices
    .map((id) => item.tasks.filter((t) => doneCountForTask(id, t, done) === t.count).length)
    .sort((a, b) => b - a);
  const sum = finishedPerTrack.slice(0, perDay).reduce((s, n) => s + n, 0);
  return { done: Math.min(sum, total), total };
}

// What the Practice page needs for one rotating item, computed on the server.
export type RotationView = { suggested: string[]; lastDoneLabel: Record<string, string> };
