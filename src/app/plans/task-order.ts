import type { PlanTask } from "../plans";

const TYPE_RANK: Record<string, number> = {
  sing: 0,
  playWithoutTrack: 2,
  playWithTrack: 3,
};

const FOCUS_RANK = 1;

function taskRank(task: PlanTask): number {
  if (task.focus !== undefined) return FOCUS_RANK;
  return TYPE_RANK[task.type] ?? Number.MAX_SAFE_INTEGER;
}

export function sortTasks(tasks: PlanTask[]): PlanTask[] {
  return [...tasks].sort((a, b) => taskRank(a) - taskRank(b));
}
