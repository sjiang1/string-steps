"use server";

import { join } from "path";
import studentsSeed from "@data/students.json";
import teacherSeed from "@data/teacher.json";
import { cookies } from "next/headers";
import type { Plan, PracticeItem, PlanSchedule, Track } from "./plans";
import { mostRecentPastPracticePlanIdAsOf, practicePlanIdOn } from "./plans";
import { rhythms } from "./rhythms";
import { isNonPracticeDay } from "./day-types";
import { todayLocal } from "./today";
import { firstPracticeDayOnOrAfter, applyActiveFrom } from "./plans/schedule-activation";
import { doneLogId, findPrimary, type Student } from "./students";
import { isRotating, rotatingItemProgress } from "./rotation";
import { doneCountForTask } from "./task-keys";
import { readJson } from "./storage";
import { getDone, toggleDone } from "./practice-log";
import { getNotes, setNote } from "./notes";
import { getTrackBlobUrl as lookupTrackBlobUrl, setTrackBlobUrl } from "./track-blobs";
import { getTracks as listTracks, addTracks } from "./tracks";
import { getPlanMap, putPlan, createPlanWithNewId } from "./plan-store";
import {
  getScheduleMap,
  setScheduleEntry,
  setScheduleEntryIfAbsent,
  deleteScheduleEntry,
  writeScheduleDiff,
} from "./schedule";


const CHECKLIST_BLOBS_KEY = "checklist:blobs";
const STUDENTS_KEY = "students:list";
const TEACHER_KEY = "teacher:info";

const CHECKLIST_BLOBS_PATH =
  process.env.CHECKLIST_BLOBS_JSON_PATH ?? join(process.cwd(), "data/checklist-blobs.json");
const STUDENTS_PATH = process.env.STUDENTS_JSON_PATH ?? join(process.cwd(), "data/students.json");
const TEACHER_PATH = process.env.TEACHER_JSON_PATH ?? join(process.cwd(), "data/teacher.json");

function notesAddDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

// --- Public API ---

// Upgrade legacy practice items at read time — keeps prod data working without
// a manual Redis migration. Two generations of shape are handled: a single
// `trackId` (pre-#4) becomes the `trackChoices` pool, and `dice: true` without
// `dieChoices` (pre-#5) gets the six rhythms as its choice list (today's rhythm
// die, unchanged behavior). `dice: false` sheds any stray `dieChoices`.
function normalizeItem(item: PracticeItem): PracticeItem {
  let out = item;
  if (!Array.isArray(out.trackChoices)) {
    const legacy = out as unknown as { trackId?: string };
    const { trackId, ...rest } = legacy;
    out = { ...(rest as object), trackChoices: trackId ? [trackId] : [] } as PracticeItem;
  }
  if (out.dice && out.dieChoices === undefined) {
    out = {
      ...out,
      dieChoices: rhythms.map((r) => ({ kind: "rhythm", rhythmId: r.id })),
    };
  } else if (!out.dice && out.dieChoices !== undefined) {
    const rest = { ...out };
    delete rest.dieChoices;
    out = rest;
  }
  return out;
}

function normalizePlans(plans: Plan[]): Plan[] {
  return plans.map((plan) => ({
    ...plan,
    items: plan.items.map(normalizeItem),
  }));
}

export async function getPlans(): Promise<Plan[]> {
  return normalizePlans(Object.values(await getPlanMap()));
}

function ensureTodayInSchedule(
  schedule: PlanSchedule,
  today: string,
): { schedule: PlanSchedule; mutated: boolean } {
  if (today in schedule) return { schedule, mutated: false };
  let lastPlanDate: string | null = null;
  let lastPlanId: string | null = null;
  for (const [date, value] of Object.entries(schedule)) {
    if (date >= today) continue;
    if (isNonPracticeDay(value)) continue;
    if (lastPlanDate === null || date > lastPlanDate) {
      lastPlanDate = date;
      lastPlanId = value;
    }
  }
  if (lastPlanId === null) return { schedule, mutated: false };
  return { schedule: { ...schedule, [today]: lastPlanId }, mutated: true };
}

export async function getSchedule(): Promise<PlanSchedule> {
  const today = todayLocal();
  const raw = await getScheduleMap();
  const { schedule, mutated } = ensureTodayInSchedule(raw, today);
  if (mutated) {
    // Set-if-absent: a parallel request may have filled today first; if so,
    // its value wins and we re-read rather than return our guess.
    const written = await setScheduleEntryIfAbsent(today, schedule[today]);
    if (!written) return getScheduleMap();
  }
  return schedule;
}

// Sets or clears a day-type label for a date in the schedule. Any date, with
// one rule for the past (#30): a day the primary ticked practice on cannot be
// relabelled, since a label would hide those ticks from the calendar and the
// Teacher report. Linked accounts' ticks don't count; they fall back to the
// previous plan on class days anyway. Clearing a label on today or a future
// date deletes the entry, so the date defaults to a practice day when it
// arrives (ensureTodayInSchedule / resolveActivePlanId); clearing a past date
// writes back the plan that was active then, because nothing fills past days
// in automatically. Unauthenticated, matching the other schedule/plan
// mutations.
export async function setDayType(date: string, dayTypeId: string | null): Promise<void> {
  if (dayTypeId !== null && !isNonPracticeDay(dayTypeId)) {
    throw new Error(`Unknown day type "${dayTypeId}"`);
  }
  const past = date < todayLocal();
  if (past) {
    const ticks = await getDoneTasks(date, await getPrimaryStudent());
    if (ticks.length > 0) {
      throw new Error(`Cannot relabel ${date}: practice was logged that day`);
    }
  }
  if (dayTypeId !== null) {
    await setScheduleEntry(date, dayTypeId);
    return;
  }
  if (past) {
    const previous = mostRecentPastPracticePlanIdAsOf(date, await getScheduleMap());
    if (previous !== null) {
      await setScheduleEntry(date, previous);
      return;
    }
  }
  await deleteScheduleEntry(date);
}

export async function getTracks(): Promise<Track[]> {
  return listTracks();
}

export type Teacher = { name: string };

export async function getStudents(): Promise<Student[]> {
  return readJson<Student[]>(STUDENTS_KEY, STUDENTS_PATH, studentsSeed as Student[]);
}

export async function getPrimaryStudent(): Promise<Student> {
  return findPrimary(await getStudents());
}

export async function getTeacher(): Promise<Teacher> {
  return readJson<Teacher>(TEACHER_KEY, TEACHER_PATH, teacherSeed as Teacher);
}

export async function getActiveStudent(): Promise<Student> {
  const students = await getStudents();
  const cookieStore = await cookies();
  const id = cookieStore.get("activeStudentId")?.value;
  const match = id ? students.find((s) => s.id === id) : undefined;
  return match ?? findPrimary(students);
}

export async function getDoneTasks(
  date: string,
  student: Student,
): Promise<string[]> {
  return getDone(doneLogId(student, date));
}

// The student's done keys for the `days` dates before `beforeDate`, newest
// first — the input for ranking a rotating item's tracks.
export async function getDoneHistory(
  student: Student,
  beforeDate: string,
  days: number,
): Promise<{ date: string; done: string[] }[]> {
  const dates = Array.from({ length: days }, (_, i) => notesAddDays(beforeDate, -(i + 1)));
  return Promise.all(dates.map(async (date) => ({ date, done: await getDoneTasks(date, student) })));
}

export async function toggleTask(date: string, taskKey: string): Promise<string[]> {
  const student = await getActiveStudent();
  return toggleDone(doneLogId(student, date), taskKey);
}

export type MonthProgressEntry =
  | { type: "practice"; done: number; total: number }
  | { type: "non-practice"; dayTypeId: string };

export async function getMonthProgress(
  yearMonth: string
): Promise<Record<string, MonthProgressEntry>> {
  const student = await getActiveStudent();
  const schedule = await getSchedule();
  const plans = await getPlans();
  const result: Record<string, MonthProgressEntry> = {};

  // Each task counts once, whatever its repetition count. It's done when the
  // taps on any one track in the item's pool (a 🎲 roll records taps under the
  // rolled track) exactly match its count — the same point TaskList shows ✅.
  // Strict equality: a target lowered after tapping leaves extra taps, and the
  // task list doesn't show ✅ for those.
  function planProgress(plan: Plan, done: string[]): { done: number; total: number } {
    let finished = 0;
    let total = 0;
    for (const item of plan.items) {
      if (isRotating(item)) {
        const p = rotatingItemProgress(item, done);
        finished += p.done;
        total += p.total;
        continue;
      }
      for (const task of item.tasks) {
        total++;
        if (item.trackChoices.some((id) => doneCountForTask(id, task, done) === task.count)) {
          finished++;
        }
      }
    }
    return { done: finished, total };
  }

  for (const [date, value] of Object.entries(schedule)) {
    if (!date.startsWith(yearMonth)) continue;

    // A linked account's class day resolves to the plan it practiced from.
    const planId = practicePlanIdOn(date, schedule, student);
    const plan = planId === null ? undefined : plans.find((p) => p.id === planId);
    if (plan) {
      const doneTasks = await getDoneTasks(date, student);
      result[date] = { type: "practice", ...planProgress(plan, doneTasks) };
    } else if (isNonPracticeDay(value)) {
      result[date] = { type: "non-practice", dayTypeId: value };
    }
  }

  return result;
}

// A plan is frozen (locked from editing) only once a past date mapped to it
// carries real history — either practice (some student has done-log entries) or
// a track note. A past-dated schedule entry alone is not enough: the public
// demo seed pins a far-past date to surface the sample plan as "today's
// practice", but with no practice and no notes it must stay editable. Notes
// count because editing a plan can retroactively hide a historical note from
// the Teacher report (which lists tracks from the plan's current items), so an
// engaged-but-unpracticed past day still locks the plan.
export async function isPlanFrozen(planId: string): Promise<boolean> {
  const schedule = await getSchedule();
  const today = todayLocal();
  const pastDates = Object.entries(schedule)
    .filter(([date, value]) => value === planId && date < today)
    .map(([date]) => date);
  if (pastDates.length === 0) return false;

  const students = await getStudents();
  for (const date of pastDates) {
    if (Object.keys(await getNotesForDate(date)).length > 0) return true;
    for (const student of students) {
      if ((await getDoneTasks(date, student)).length > 0) return true;
    }
  }
  return false;
}

// newReferenceTracks: media-less tracks created inline in the plan editor
// ("add custom practice"). They are persisted to the catalog together with the
// plan so abandoning the edit leaves no orphan tracks. The frozen check runs
// first, so a rejected save writes neither the plan nor the tracks. Tracks
// whose id already exists are skipped (idempotent against double-saves).
export async function savePlan(
  plan: Plan,
  newReferenceTracks: Track[] = [],
): Promise<void> {
  if (await isPlanFrozen(plan.id)) {
    throw new Error(`Plan "${plan.id}" is frozen — a past date has practice or a note, so it cannot be edited`);
  }

  if (newReferenceTracks.length > 0) await addTracks(newReferenceTracks);

  await putPlan(plan);
}

export async function createPlan(
  plan: Plan,
  activeFrom: string,
): Promise<{ id: string }> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _ignored, ...rest } = plan;
  const { id: newId } = await createPlanWithNewId({
    ...rest,
    createdDate: plan.createdDate || todayLocal(),
  });

  const today = todayLocal();
  const schedule = await getSchedule();
  const anchor = firstPracticeDayOnOrAfter(schedule, activeFrom < today ? today : activeFrom);
  await writeScheduleDiff(schedule, applyActiveFrom(schedule, newId, anchor));
  return { id: newId };
}

export async function addTrack(track: Track, blobUrl: string): Promise<void> {
  await addTracks([track]);
  await setTrackBlobUrl(track.id, blobUrl);
}

export async function getTrackBlobUrl(id: string): Promise<string | null> {
  return lookupTrackBlobUrl(id);
}

export async function getChecklistImageBlobs(): Promise<Record<string, string>> {
  return readJson<Record<string, string>>(
    CHECKLIST_BLOBS_KEY,
    CHECKLIST_BLOBS_PATH,
    {},
  );
}

export async function getChecklistImageBlobUrl(id: string): Promise<string | null> {
  const blobs = await getChecklistImageBlobs();
  return blobs[id] ?? null;
}

export async function getNotesForDate(
  date: string,
): Promise<Record<string, string>> {
  return getNotes(date);
}

export async function saveTrackNote(
  date: string,
  trackId: string,
  note: string,
): Promise<void> {
  await setNote(date, trackId, note);
}

export async function getNotesInRange(
  startDate: string,
  endDate: string,
): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  if (startDate > endDate) return out;
  for (let d = startDate; d <= endDate; d = notesAddDays(d, 1)) {
    const day = await getNotesForDate(d);
    if (Object.keys(day).length > 0) out[d] = day;
  }
  return out;
}
