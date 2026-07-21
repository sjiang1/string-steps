import { getDayType, isClassDay, isNonPracticeDay, type DayType } from "./day-types";
import type { Student } from "./students";

export type PlanTask = {
  type: string;
  count: number;
  focus?: string;
};

export type PracticeItem = {
  trackChoices: string[];
  tasks: PlanTask[];
  dice: boolean;
  teacherNote?: string;
};

// The single track a practice item currently resolves to. Today an item always
// has exactly one active track (the first/only one in its pool). When the dice
// feature lands (#5), this is the seam that returns the rolled track instead.
export function primaryTrackId(item: PracticeItem): string {
  const trackId = item.trackChoices[0];
  if (!trackId) {
    throw new Error("PracticeItem.trackChoices must contain at least one trackId");
  }
  return trackId;
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
