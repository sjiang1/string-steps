import { getMonthProgress } from "../actions";
import { todayLocal } from "../today";
import CalendarGrid from "./CalendarGrid";

export default async function CalendarPage() {
  const today = todayLocal();
  const [yearStr, monthStr] = today.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed
  const yearMonth = `${yearStr}-${monthStr}`;

  const progress = await getMonthProgress(yearMonth);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <h1 className="text-2xl font-bold mb-4">Calendar</h1>
      <CalendarGrid
        initialYear={year}
        initialMonth={month}
        progress={progress}
        today={today}
      />
    </div>
  );
}
