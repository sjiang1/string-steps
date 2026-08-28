import { getDayType, isClassDay, isNonPracticeDay, type DayType } from "./day-types";
import type { Student } from "./students";

export type PlanTask = {
  type: string;
  count: number;
  focus?: string;
};

export type DieChoice =
  | { kind: "track"; trackId: string } // trackId must be in item.trackChoices
  | { kind: "rhythm"; rhythmId: string }; // rhythmId must exist in dice-rhythms.json

export type PracticeItem = {
  name?: string; // the item's own title; falls back to the primary track's name
  trackChoices: string[];
  tasks: PlanTask[];
  dice: boolean; // die-enabled status (future: auto-summon the die when true)
  dieChoices?: DieChoice[]; // required 1–6 entries when dice is true; face N = index N-1
  teacherNote?: string;
};

// The track a practice item resolves to before any roll: the first in its pool.
export function primaryTrackId(item: PracticeItem): string {
  return item.trackChoices[0];
}

// What a practice item is called: its own name when set, else its primary
// track's name (else the raw track id for an unknown track).
export function itemDisplayName(item: PracticeItem, tracks: Track[]): string {
  if (item.name) return item.name;
  const id = primaryTrackId(item);
  return tracks.find((t) => t.id === id)?.name ?? id;
}

// The track a rolled face resolves to. Null for rhythm choices and for faces
// beyond the choice list (a miss — the die says "roll again!").
export function rolledTrackId(item: PracticeItem, face: number): string | null {
  const choice = item.dieChoices?.[face - 1];
  return choice?.kind === "track" ? choice.trackId : null;
}

export type Plan = {
  id: string;
  createdDate: string;
  description?: string;
  items: PracticeItem[];
  checklist: string[];
};

export type PlanSchedule = Record<string, string>;

export type PlanLookupError =
  | { code: "INVALID_DATE_FORMAT"; message: string }
  | { code: "UNMAPPED_DATE"; message: string }
  | { code: "INVALID_PLAN_ID"; message: string };

export type Track = {
  id: string;
  name: string;
  type: "audio" | "video" | "reference";
  file: string | null;
};

export type PlanLookupResult =
  | { ok: true; plan: Plan }
  | { ok: true; dayType: DayType }
  | { ok: false; error: PlanLookupError };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getPlanForDate(date: string): Promise<PlanLookupResult> {
  if (!DATE_RE.test(date)) {
    return {
      ok: false,
      error: {
        code: "INVALID_DATE_FORMAT",
        message: `Expected YYYY-MM-DD, got "${date}"`,
      },
    };
  }

  const { getSchedule, getPlans } = await import("./actions");
  const schedule = await getSchedule();
  const planId = schedule[date];
  if (planId === undefined) {
    return {
      ok: false,
      error: {
        code: "UNMAPPED_DATE",
        message: `No plan scheduled for ${date}`,
      },
    };
  }

  const dayType = getDayType(planId);
  if (dayType) {
    return { ok: true, dayType };
  }

  const plans = await getPlans();
  const plan = plans.find((p) => p.id === planId);
  if (plan === undefined) {
    return {
      ok: false,
      error: {
        code: "INVALID_PLAN_ID",
        message: `Schedule for ${date} points at plan id "${planId}", which does not exist in plans.json`,
      },
    };
  }

  return { ok: true, plan };
}

export function mostRecentPastPracticePlanIdAsOf(
  date: string,
  schedule: PlanSchedule,
): string | null {
  const pastPracticeDates = Object.keys(schedule)
    .filter((d) => d < date && !isNonPracticeDay(schedule[d]))
    .sort();
  if (pastPracticeDates.length === 0) return null;
  return schedule[pastPracticeDates[pastPracticeDates.length - 1]];
}

export async function resolvePracticePlanForDate(
  date: string,
  student: Student,
): Promise<PlanLookupResult> {
  const result = await getPlanForDate(date);
  if (!result.ok) return result;
  if ("plan" in result) return result;
  if (student.kind !== "linked" || !isClassDay(result.dayType.id)) return result;

  const { getSchedule, getPlans } = await import("./actions");
  const schedule = await getSchedule();
  const fallbackId = mostRecentPastPracticePlanIdAsOf(date, schedule);
  if (fallbackId === null) return result;
  const plans = await getPlans();
  const fallbackPlan = plans.find((p) => p.id === fallbackId);
  if (fallbackPlan === undefined) return result;
  return { ok: true, plan: fallbackPlan };
}
