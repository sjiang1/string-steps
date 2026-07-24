import { primaryTrackId, type Plan } from "../plans";
import { rhythmById } from "../rhythms";

export type PlanTaskError = {
  trackId: string;
  taskIndex: number;
  reason: "empty-focus" | "duplicate";
};

export type PlanItemError = {
  trackId: string;
  reason: "die-choices-count" | "die-track-not-in-pool" | "die-rhythm-unknown" | "duplicate-pool-track";
};

export type PlanValidationError = PlanTaskError | PlanItemError;

export function isTaskError(e: PlanValidationError): e is PlanTaskError {
  return "taskIndex" in e;
}

export function validatePlan(plan: Plan): PlanValidationError[] {
  const errors: PlanValidationError[] = [];
  for (const item of plan.items) {
    const trackId = primaryTrackId(item);
    item.tasks.forEach((task, taskIndex) => {
      if (task.focus !== undefined && task.focus.trim() === "") {
        errors.push({ trackId, taskIndex, reason: "empty-focus" });
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
          errors.push({ trackId, taskIndex, reason: "duplicate" });
        }
      }
    }

    if (new Set(item.trackChoices).size !== item.trackChoices.length) {
      errors.push({ trackId, reason: "duplicate-pool-track" });
    }

    if (item.dice) {
      const choices = item.dieChoices ?? [];
      if (choices.length < 1 || choices.length > 6) {
        errors.push({ trackId, reason: "die-choices-count" });
      }
      const pool = new Set(item.trackChoices);
      if (choices.some((c) => c.kind === "track" && !pool.has(c.trackId))) {
        errors.push({ trackId, reason: "die-track-not-in-pool" });
      }
      if (choices.some((c) => c.kind === "rhythm" && rhythmById(c.rhythmId) === undefined)) {
        errors.push({ trackId, reason: "die-rhythm-unknown" });
      }
    }
  }
  return errors;
}
