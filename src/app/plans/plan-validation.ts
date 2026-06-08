import type { Plan } from "../plans";

export type PlanValidationError = {
  trackId: string;
  taskIndex: number;
  reason: "empty-focus" | "duplicate";
};

export function validatePlan(plan: Plan): PlanValidationError[] {
  const errors: PlanValidationError[] = [];
  for (const item of plan.items) {
    item.tasks.forEach((task, taskIndex) => {
      if (task.focus !== undefined && task.focus.trim() === "") {
        errors.push({ trackId: item.trackId, taskIndex, reason: "empty-focus" });
      }
    });

    const seen = new Map<string, number[]>();
    item.tasks.forEach((task, taskIndex) => {
      const key = `${task.type}:${task.focus ?? ""}`;
      const existing = seen.get(key) ?? [];
      existing.push(taskIndex);
      seen.set(key, existing);
    });
    for (const indices of seen.values()) {
      if (indices.length > 1) {
        for (const taskIndex of indices) {
          errors.push({ trackId: item.trackId, taskIndex, reason: "duplicate" });
        }
      }
    }
  }
  return errors;
}
