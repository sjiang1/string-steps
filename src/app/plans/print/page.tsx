import Link from "next/link";
import checklistItems from "@data/checklist-items.json";
import { getActiveStudent, getPlans, getPrimaryStudent, getSchedule, getTracks } from "../../actions";
import { todayLocal } from "../../today";
import { resolveActivePlanId } from "../active-plan";
import AutoPrint from "./AutoPrint";
import PrintablePlan from "./PrintablePlan";

export default async function PrintPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const [plans, schedule, tracks, primary, active, params] = await Promise.all([
    getPlans(),
    getSchedule(),
    getTracks(),
    getPrimaryStudent(),
    getActiveStudent(),
    searchParams,
  ]);
  if (active.kind !== "primary") {
    return <p className="p-8 text-zinc-600">Only the primary account can print plans.</p>;
  }
  const id = params.id ?? resolveActivePlanId(todayLocal(), schedule);
  const plan = id ? plans.find((p) => p.id === id) ?? null : null;
  if (!plan) {
    return (
      <div className="p-8 text-sm">
        <p className="text-red-700">No plan with id &ldquo;{params.id}&rdquo;.</p>
        <Link href="/plans" className="underline">Back to Plans →</Link>
      </div>
    );
  }
  const checklist = plan.checklist
    .map((cid) => checklistItems.find((c) => c.id === cid))
    .filter((c): c is (typeof checklistItems)[number] => c !== undefined)
    .map((c) => ({ id: c.id, emoji: c.emoji, description: c.description }));

  return (
    <>
      <AutoPrint />
      <PrintablePlan plan={plan} tracks={tracks} checklist={checklist} studentName={primary.name} />
    </>
  );
}
