"use server";

import { Redis } from "@upstash/redis";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import scheduleData from "@data/plan-schedule.json";
import plansSeed from "@data/plans.json";
import tracksSeed from "@data/tracks.json";
import studentsSeed from "@data/students.json";
import teacherSeed from "@data/teacher.json";
import { cookies } from "next/headers";
import type { Plan, PracticeItem, PlanSchedule, Track } from "./plans";
import { mostRecentPastPracticePlanIdAsOf } from "./plans";
import { rhythms } from "./rhythms";
import { isClassDay, isNonPracticeDay } from "./day-types";
import { todayLocal } from "./today";
import { firstPracticeDayOnOrAfter, applyActiveFrom } from "./plans/schedule-activation";
import { doneLogId, findPrimary, type Student } from "./students";

const useRedis = !!process.env.KV_REST_API_URL;
const redis = useRedis
  ? new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  : null;

const LOG_PATH = process.env.PRACTICE_LOG_PATH ?? join(process.cwd(), "data/practice-log.json");
const NOTES_PATH = process.env.NOTES_LOG_PATH ?? join(process.cwd(), "data/notes-log.json");

const PLANS_KEY = "plans:list";
const SCHEDULE_KEY = "schedule:map";
const TRACKS_KEY = "tracks:list";
const TRACK_BLOBS_KEY = "tracks:blobs";
const CHECKLIST_BLOBS_KEY = "checklist:blobs";
const STUDENTS_KEY = "students:list";
const TEACHER_KEY = "teacher:info";

const PLANS_PATH = process.env.PLANS_JSON_PATH ?? join(process.cwd(), "data/plans.json");
const SCHEDULE_PATH = process.env.SCHEDULE_JSON_PATH ?? join(process.cwd(), "data/plan-schedule.json");
const TRACKS_PATH = process.env.TRACKS_JSON_PATH ?? join(process.cwd(), "data/tracks.json");
const TRACK_BLOBS_PATH = process.env.TRACK_BLOBS_JSON_PATH ?? join(process.cwd(), "data/track-blobs.json");
const CHECKLIST_BLOBS_PATH =
  process.env.CHECKLIST_BLOBS_JSON_PATH ?? join(process.cwd(), "data/checklist-blobs.json");
const STUDENTS_PATH = process.env.STUDENTS_JSON_PATH ?? join(process.cwd(), "data/students.json");
const TEACHER_PATH = process.env.TEACHER_JSON_PATH ?? join(process.cwd(), "data/teacher.json");

function redisKey(logId: string): string {
  return `practice:${logId}`;
}

function notesRedisKey(date: string): string {
  return `notes:${date}`;
}

function notesAddDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function readNotes(): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(NOTES_PATH, "utf-8"));
}

function writeNotes(notes: Record<string, Record<string, string>>): void {
  writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2) + "\n");
}

const INDEXED_KEY_RE = /-\d+$/;

function migrateKeys(keys: string[]): { keys: string[]; changed: boolean } {
  let changed = false;
  const out = keys.map((k) => {
    if (INDEXED_KEY_RE.test(k)) return k;
    changed = true;
    return `${k}-0`;
  });
  return { keys: out, changed };
}

// --- File-based helpers (local fallback) ---

function readLog(): Record<string, string[]> {
  return JSON.parse(readFileSync(LOG_PATH, "utf-8"));
}

function writeLog(log: Record<string, string[]>): void {
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2) + "\n");
}

async function readJson<T>(redisKey: string, filePath: string, seed: T): Promise<T> {
  if (redis) {
    const existing = await redis.get<T>(redisKey);
    if (existing !== null && existing !== undefined) return existing;
    await redis.set(redisKey, seed);
    return seed;
  }
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

async function writeJson<T>(redisKey: string, filePath: string, value: T): Promise<void> {
  if (redis) {
    await redis.set(redisKey, value);
  } else {
    writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
  }
}

function nextPlanId(plans: Plan[]): string {
  const numericIds = plans
    .map((p) => parseInt(p.id, 10))
    .filter((n) => !isNaN(n));
  const max = numericIds.length === 0 ? -1 : Math.max(...numericIds);
  return String(max + 1);
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
    const { dieChoices: _stray, ...rest } = out;
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
  return normalizePlans(
    await readJson<Plan[]>(PLANS_KEY, PLANS_PATH, plansSeed as unknown as Plan[]),
  );
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
  const raw = await readJson<PlanSchedule>(SCHEDULE_KEY, SCHEDULE_PATH, scheduleData as PlanSchedule);
  const { schedule, mutated } = ensureTodayInSchedule(raw, todayLocal());
  if (mutated) {
    await writeJson<PlanSchedule>(SCHEDULE_KEY, SCHEDULE_PATH, schedule);
  }
  return schedule;
}

// Sets or clears a day-type label for a date in the schedule. Today + future
// only (past days are read-only); a null dayTypeId clears the label by deleting
// the entry, so the date defaults to a practice day when it arrives (via
// ensureTodayInSchedule / resolveActivePlanId). Unauthenticated, matching the
// other schedule/plan mutations.
export async function setDayType(date: string, dayTypeId: string | null): Promise<void> {
  if (date < todayLocal()) {
    throw new Error(`Cannot label a past date (${date})`);
  }
  if (dayTypeId !== null && !isNonPracticeDay(dayTypeId)) {
    throw new Error(`Unknown day type "${dayTypeId}"`);
  }
  const schedule = await getSchedule();
  if (dayTypeId === null) {
    delete schedule[date];
  } else {
    schedule[date] = dayTypeId;
  }
  await writeJson<PlanSchedule>(SCHEDULE_KEY, SCHEDULE_PATH, schedule);
}

export async function getTracks(): Promise<Track[]> {
  return readJson<Track[]>(TRACKS_KEY, TRACKS_PATH, tracksSeed as Track[]);
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
  const logId = doneLogId(student, date);
  if (redis) {
    const raw = (await redis.get<string[]>(redisKey(logId))) ?? [];
    const { keys, changed } = migrateKeys(raw);
    if (changed) await redis.set(redisKey(logId), keys);
    return keys;
  }
  const log = readLog();
  const raw = log[logId] ?? [];
  const { keys, changed } = migrateKeys(raw);
  if (changed) {
    log[logId] = keys;
    writeLog(log);
  }
  return keys;
}

export async function toggleTask(date: string, taskKey: string): Promise<string[]> {
  const student = await getActiveStudent();
  const logId = doneLogId(student, date);
  const tasks = await getDoneTasks(date, student);
  const next = tasks.includes(taskKey)
    ? tasks.filter((x) => x !== taskKey)
    : [...tasks, taskKey];

  if (redis) {
    await redis.set(redisKey(logId), next);
  } else {
    const log = readLog();
    log[logId] = next;
    writeLog(log);
  }
  return next;
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

  function planTaskTotal(plan: Plan): number {
    return plan.items.reduce(
      (sum, item) => sum + item.tasks.reduce((s, t) => s + t.count, 0),
      0,
    );
  }

  for (const [date, value] of Object.entries(schedule)) {
    if (!date.startsWith(yearMonth)) continue;

    if (isNonPracticeDay(value)) {
      if (student.kind === "linked" && isClassDay(value)) {
        const fallbackId = mostRecentPastPracticePlanIdAsOf(date, schedule);
        const fallbackPlan = fallbackId
          ? plans.find((p) => p.id === fallbackId) ?? null
          : null;
        if (fallbackPlan) {
          const doneTasks = await getDoneTasks(date, student);
          result[date] = {
            type: "practice",
            done: doneTasks.length,
            total: planTaskTotal(fallbackPlan),
          };
          continue;
        }
      }
      result[date] = { type: "non-practice", dayTypeId: value };
      continue;
    }

    const plan = plans.find((p) => p.id === value);
    if (!plan) continue;

    const doneTasks = await getDoneTasks(date, student);
    result[date] = { type: "practice", done: doneTasks.length, total: planTaskTotal(plan) };
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

  if (newReferenceTracks.length > 0) {
    const tracks = await getTracks();
    const existing = new Set(tracks.map((t) => t.id));
    const toAdd = newReferenceTracks.filter((t) => !existing.has(t.id));
    if (toAdd.length > 0) {
      await writeJson<Track[]>(TRACKS_KEY, TRACKS_PATH, [...tracks, ...toAdd]);
    }
  }

  const plans = await getPlans();
  const idx = plans.findIndex((p) => p.id === plan.id);
  const next = idx >= 0
    ? [...plans.slice(0, idx), plan, ...plans.slice(idx + 1)]
    : [...plans, plan];
  await writeJson<Plan[]>(PLANS_KEY, PLANS_PATH, next);
}

export async function createPlan(
  plan: Plan,
  activeFrom: string,
): Promise<{ id: string }> {
  const plans = await getPlans();
  const newId = nextPlanId(plans);
  const toSave: Plan = { ...plan, id: newId, createdDate: plan.createdDate || todayLocal() };
  await writeJson<Plan[]>(PLANS_KEY, PLANS_PATH, [...plans, toSave]);

  const today = todayLocal();
  const schedule = await getSchedule();
  const anchor = firstPracticeDayOnOrAfter(schedule, activeFrom < today ? today : activeFrom);
  await writeJson<PlanSchedule>(SCHEDULE_KEY, SCHEDULE_PATH, applyActiveFrom(schedule, newId, anchor));
  return { id: newId };
}

export async function addTrack(track: Track, blobUrl: string): Promise<void> {
  const tracks = await getTracks();
  const next = [...tracks, track];
  await writeJson<Track[]>(TRACKS_KEY, TRACKS_PATH, next);

  const blobs = await readJson<Record<string, string>>(
    TRACK_BLOBS_KEY,
    TRACK_BLOBS_PATH,
    {},
  );
  blobs[track.id] = blobUrl;
  await writeJson<Record<string, string>>(TRACK_BLOBS_KEY, TRACK_BLOBS_PATH, blobs);
}

export async function getTrackBlobUrl(id: string): Promise<string | null> {
  const blobs = await readJson<Record<string, string>>(
    TRACK_BLOBS_KEY,
    TRACK_BLOBS_PATH,
    {},
  );
  return blobs[id] ?? null;
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
  if (redis) {
    return (await redis.get<Record<string, string>>(notesRedisKey(date))) ?? {};
  }
  const all = readNotes();
  return all[date] ?? {};
}

export async function saveTrackNote(
  date: string,
  trackId: string,
  note: string,
): Promise<void> {
  const trimmed = note.trim();

  if (redis) {
    const day =
      (await redis.get<Record<string, string>>(notesRedisKey(date))) ?? {};
    if (trimmed === "") delete day[trackId];
    else day[trackId] = trimmed;
    await redis.set(notesRedisKey(date), day);
    return;
  }

  const all = readNotes();
  const day = all[date] ?? {};
  if (trimmed === "") delete day[trackId];
  else day[trackId] = trimmed;
  if (Object.keys(day).length === 0) delete all[date];
  else all[date] = day;
  writeNotes(all);
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
