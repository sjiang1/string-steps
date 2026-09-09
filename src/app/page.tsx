import taskTypes from "@data/task-types.json";
import checklistItems from "@data/checklist-items.json";
import GetReadyChecklist from "./GetReadyChecklist";
import PracticeTasksList from "./PracticeTasksList";
import { resolvePracticePlanForDate } from "./plans";
import {
  getActiveStudent,
  getChecklistImageBlobs,
  getDoneTasks,
  getNotesForDate,
  getPrimaryStudent,
  getTeacher,
  getTracks,
} from "./actions";
import { todayLocal } from "./today";

export default async function Home() {
  const today = todayLocal();
  const activeStudent = await getActiveStudent();
  const [primary, teacher] = await Promise.all([getPrimaryStudent(), getTeacher()]);
  const statePhrase =
    activeStudent.kind === "linked" ? (
      <p className="text-sm italic text-zinc-500">
        🎻 Practicing as {activeStudent.emoji} {activeStudent.name}
      </p>
    ) : null;
  const [result, tracks, doneTasks, notesByTrack, checklistBlobs] = await Promise.all([
    resolvePracticePlanForDate(today, activeStudent),
    getTracks(),
    getDoneTasks(today, activeStudent),
    activeStudent.kind === "primary"
      ? getNotesForDate(today)
      : Promise.resolve<Record<string, string>>({}),
    getChecklistImageBlobs(),
  ]);

  if (!result.ok) {
    let message: string;
    if (result.error.code === "UNMAPPED_DATE") {
      message = result.error.message;
    } else {
      console.error(result.error.message);
      message = "An unexpected error occurred.";
    }
    return (
      <div className="min-h-full bg-zinc-50 p-8 font-sans">
        <h1 className="text-2xl font-bold mb-1">{primary.name}&apos;s Practice</h1>
        <p className="text-zinc-500 mb-6">
          Teacher: {teacher.name} &middot; {today}
        </p>
        {statePhrase}
        <p className="text-zinc-600">{message}</p>
      </div>
    );
  }

  if ("dayType" in result) {
    return (
      <div className="min-h-full bg-zinc-50 p-8 font-sans">
        <h1 className="text-2xl font-bold mb-1">{primary.name}&apos;s Practice</h1>
        <p className="text-zinc-500 mb-6">
          Teacher: {teacher.name} &middot; {today}
        </p>
        {statePhrase}
        <p className="text-zinc-600">
          {result.dayType.label} day — no practice {result.dayType.emoji}
        </p>
      </div>
    );
  }

  const plan = result.plan;

  return (
    <div className="min-h-full bg-zinc-50 font-sans">
      <div className="px-8 pt-8 pb-4">
        <h1 className="text-2xl font-bold mb-1">{primary.name}&apos;s Practice</h1>
        <p className="text-zinc-500 mb-1">
          Teacher: {teacher.name} &middot; {today}
        </p>
        {statePhrase}
        {plan.description && (
          <p className="text-zinc-500">{plan.description}</p>
        )}
      </div>

      <div className="bg-zinc-50 px-8 pt-4 pb-4 border-b border-zinc-200">
        <h2 className="text-lg font-semibold mb-2">Get Ready Checklist</h2>
        <GetReadyChecklist
          items={plan.checklist
            .map((id) => checklistItems.find((c) => c.id === id))
            .filter((c) => c != null)
            .map((c) => ({
              ...c,
              image: checklistBlobs[c.id] ? `/api/img/${c.id}` : null,
            }))}
        />
      </div>

      <div className="px-8 pt-6 pb-8">
        <h2 className="text-lg font-semibold mb-2">Practice</h2>
        <PracticeTasksList
          items={plan.items}
          tracks={tracks}
          taskTypes={taskTypes}
          doneTasks={doneTasks}
          notesByTrack={notesByTrack}
          activeStudent={activeStudent}
        />
      </div>
    </div>
  );
}
