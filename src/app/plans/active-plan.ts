import { isNonPracticeDay } from "../day-types";
import { mostRecentPastPracticePlanIdAsOf } from "../plans";

// The plan the Plans tab shows by default: today's, else the next scheduled,
// else the most recent past one.
export function resolveActivePlanId(today: string, schedule: Record<string, string>): string | null {
  if (schedule[today] && !isNonPracticeDay(schedule[today])) return schedule[today];
  const futurePracticeDates = Object.keys(schedule)
    .filter((d) => d > today && !isNonPracticeDay(schedule[d]))
    .sort();
  if (futurePracticeDates.length > 0) return schedule[futurePracticeDates[0]];
  return mostRecentPastPracticePlanIdAsOf(today, schedule);
}
