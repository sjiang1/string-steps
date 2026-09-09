import {
  getSchedule,
  getPlans,
  getTracks,
  getDoneTasks,
  getNotesInRange,
  getPrimaryStudent,
  getTeacher,
} from "../actions";
import {
  computeTeacherWindow,
  datesInRange,
  aggregateTeacherReport,
  formatLong,
} from "../teacher-data";
import TeacherEmailBuilder from "./TeacherEmailBuilder";
import { todayLocal } from "../today";

export default async function TeacherPage() {
  const today = todayLocal();
  const primary = await getPrimaryStudent();
  const [schedule, plans, tracks, teacher] = await Promise.all([
    getSchedule(),
    getPlans(),
    getTracks(),
    getTeacher(),
  ]);

  const window = computeTeacherWindow(today, schedule);
  const dates = datesInRange(window.startDate, window.endDate);

  const doneEntries = await Promise.all(
    dates.map(async (d) => [d, await getDoneTasks(d, primary)] as const),
  );
  const doneByDate = Object.fromEntries(doneEntries);
  const notesByDate = await getNotesInRange(
    window.startDate,
    window.endDate,
  );

  const report = aggregateTeacherReport({
    window,
    schedule,
    plans,
    tracks,
    doneByDate,
    notesByDate,
  });

  return (
    <div className="min-h-full bg-zinc-50 p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">
        👨‍🏫 {primary.name}&apos;s practice — {formatLong(window.startDate)}{" "}
        through {formatLong(window.endDate)}
      </h1>
      {window.bounded && (
        <p className="text-sm text-zinc-500 mb-4">
          Showing the most recent {dates.length} days
        </p>
      )}

      <TeacherEmailBuilder
        report={report}
        studentName={primary.name}
        teacherName={teacher.name}
      />
    </div>
  );
}
