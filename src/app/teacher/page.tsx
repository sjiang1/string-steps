import {
  getSchedule,
  getPlans,
  getTracks,
  getDoneTasks,
  getNotesInRange,
  getPrimaryStudent,
} from "../actions";
import {
  computeTeacherWindow,
  datesInRange,
  aggregateTeacherReport,
  formatLong,
  formatShort,
} from "../teacher-data";
import { todayLocal } from "../today";

export default async function TeacherPage() {
  const today = todayLocal();
  const primary = await getPrimaryStudent();
  const [schedule, plans, tracks] = await Promise.all([
    getSchedule(),
    getPlans(),
    getTracks(),
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
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">
        👨‍🏫 {primary.name}&apos;s practice — {formatLong(window.startDate)}{" "}
        through {formatLong(window.endDate)}
      </h1>
      {window.bounded && (
        <p className="text-sm text-zinc-500 mb-4">
          Showing the most recent {dates.length} days
        </p>
      )}

      <ul className="space-y-4 mt-6">
        {report.map((entry) => (
          <li
            key={entry.trackId}
            className="rounded-lg border bg-white p-4"
          >
            <div className="font-semibold mb-1">{entry.name}</div>
            <div className="text-sm text-zinc-600">
              {entry.progress.map((p, i) => (
                <span key={p.type}>
                  {i > 0 && " · "}
                  {p.label} {p.done}/{p.total}
                </span>
              ))}
            </div>
            {entry.notes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {entry.notes.map((n) => (
                  <li
                    key={n.date}
                    className="text-sm italic text-zinc-500"
                  >
                    {formatShort(n.date)} — “{n.note}”
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {report.length === 0 && (
          <li className="text-zinc-500">
            No tracks were scheduled in this window.
          </li>
        )}
      </ul>
    </div>
  );
}
