import type { PlanTask } from "./plans";

export function tapKey(trackId: string, task: PlanTask, repIndex: number): string {
  const suffix = task.focus !== undefined ? `${task.type}:${task.focus}` : task.type;
  return `${trackId}-${suffix}-${repIndex}`;
}

export function doneCountForTask(trackId: string, task: PlanTask, done: string[]): number {
  const middle = task.focus !== undefined ? `${task.type}:${task.focus}` : task.type;
  const prefix = `${trackId}-${middle}-`;
  return done.filter((k) => {
    if (!k.startsWith(prefix)) return false;
    return /^\d+$/.test(k.slice(prefix.length));
  }).length;
}
