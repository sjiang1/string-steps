import Link from "next/link";
import { getDoneTasks, getPlans, getPrimaryStudent, getSchedule, getTracks, isPlanFrozen } from "../actions";
import { isNonPracticeDay } from "../day-types";
import { mostRecentPastPracticePlanIdAsOf } from "../plans";
import { todayLocal } from "../today";
import PlanEditor from "./PlanEditor";
import NewPlanButton from "./NewPlanButton";
import { defaultActiveFrom } from "./schedule-activation";

function resolveActivePlanId(today: string, schedule: Record<string, string>): string | null {
  if (schedule[today] && !isNonPracticeDay(schedule[today])) return schedule[today];
  const futurePracticeDates = Object.keys(schedule)
    .filter((d) => d > today && !isNonPracticeDay(schedule[d]))
    .sort();
  if (futurePracticeDates.length > 0) return schedule[futurePracticeDates[0]];
  return mostRecentPastPracticePlanIdAsOf(today, schedule);
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const today = todayLocal();
  const primary = await getPrimaryStudent();
  const [plans, schedule, tracks, params, doneToday] = await Promise.all([
    getPlans(),
    getSchedule(),
    getTracks(),
    searchParams,
    getDoneTasks(today, primary),
  ]);
  const defaultActive = defaultActiveFrom(schedule, today, doneToday.length > 0);
  const requestedPlan = params.id ? plans.find((p) => p.id === params.id) ?? null : null;
  const idNotFound = params.id !== undefined && requestedPlan === null;
  const scheduledId = resolveActivePlanId(today, schedule);
  const scheduledPlan = scheduledId ? plans.find((p) => p.id === scheduledId) ?? null : null;
  const activePlan = requestedPlan ?? (idNotFound ? null : scheduledPlan);
  const frozen = activePlan ? await isPlanFrozen(activePlan.id) : false;

  return (
    <div className="min-h-screen bg-zinc-50 p-8 pb-24 font-sans">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Plans</h1>
        <NewPlanButton sourcePlan={activePlan ?? scheduledPlan} defaultActiveFrom={defaultActive} />
      </div>
      {idNotFound ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-medium text-red-700">
            No plan with id &ldquo;{params.id}&rdquo;.
          </p>
          {scheduledPlan ? (
            <p className="mt-2 text-red-700">
              <Link href="/plans" className="underline">
                Go to current plan ({scheduledPlan.description || `Plan ${scheduledPlan.id}`}) →
              </Link>
            </p>
          ) : (
            <p className="mt-2 text-red-700">
              <Link href="/plans" className="underline">
                Back to Plans →
              </Link>
            </p>
          )}
        </div>
      ) : activePlan ? (
        <PlanEditor plan={activePlan} tracks={tracks} frozen={frozen} />
      ) : (
        <p className="text-zinc-600">No plan yet. Tap &quot;+ New plan&quot; to create one.</p>
      )}
    </div>
  );
}
