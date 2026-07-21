import { describe, it, expect } from "vitest";
import { validatePlan } from "./plan-validation";
import type { Plan } from "../plans";

function plan(items: Plan["items"]): Plan {
  return { id: "0", createdDate: "2026-04-24", items, checklist: [] };
}

describe("validatePlan", () => {
  it("returns no errors for a plan with only regular tasks", () => {
    const p = plan([
      { trackChoices: ["scale"], tasks: [{ type: "playWithoutTrack", count: 1 }], dice: false },
    ]);
    expect(validatePlan(p)).toEqual([]);
  });

  it("returns no errors for a plan with a valid focus task", () => {
    const p = plan([
      {
        trackChoices: ["may-song"],
        tasks: [
          { type: "playWithoutTrack", count: 1 },
          { type: "playWithoutTrack", count: 6, focus: "bars 5-8" },
        ],
        dice: false,
      },
    ]);
    expect(validatePlan(p)).toEqual([]);
  });

  it("flags an empty focus string", () => {
    const p = plan([
      {
        trackChoices: ["x"],
        tasks: [{ type: "sing", count: 1, focus: "" }],
        dice: false,
      },
    ]);
    expect(validatePlan(p)).toEqual([
      { trackId: "x", taskIndex: 0, reason: "empty-focus" },
    ]);
  });

  it("flags a whitespace-only focus string", () => {
    const p = plan([
      {
        trackChoices: ["x"],
        tasks: [{ type: "sing", count: 1, focus: "   " }],
        dice: false,
      },
    ]);
    expect(validatePlan(p)).toEqual([
      { trackId: "x", taskIndex: 0, reason: "empty-focus" },
    ]);
  });

  it("flags duplicate (type, focus) pairs on the same track — both offending indices", () => {
    const p = plan([
      {
        trackChoices: ["x"],
        tasks: [
          { type: "playWithoutTrack", count: 6, focus: "bars 5-8" },
          { type: "playWithoutTrack", count: 4, focus: "bars 5-8" },
        ],
        dice: false,
      },
    ]);
    expect(validatePlan(p)).toEqual([
      { trackId: "x", taskIndex: 0, reason: "duplicate" },
      { trackId: "x", taskIndex: 1, reason: "duplicate" },
    ]);
  });

  it("flags duplicate regular tasks of the same type on the same track", () => {
    const p = plan([
      {
        trackChoices: ["x"],
        tasks: [
          { type: "sing", count: 1 },
          { type: "sing", count: 2 },
        ],
        dice: false,
      },
    ]);
    expect(validatePlan(p)).toEqual([
      { trackId: "x", taskIndex: 0, reason: "duplicate" },
      { trackId: "x", taskIndex: 1, reason: "duplicate" },
    ]);
  });

  it("does not flag regular and focus tasks with the same type on the same track", () => {
    const p = plan([
      {
        trackChoices: ["x"],
        tasks: [
          { type: "playWithoutTrack", count: 1 },
          { type: "playWithoutTrack", count: 6, focus: "bars 5-8" },
        ],
        dice: false,
      },
    ]);
    expect(validatePlan(p)).toEqual([]);
  });

  it("scopes duplicate detection per track — same (type, focus) across different tracks is fine", () => {
    const p = plan([
      { trackChoices: ["a"], tasks: [{ type: "sing", count: 1 }], dice: false },
      { trackChoices: ["b"], tasks: [{ type: "sing", count: 1 }], dice: false },
    ]);
    expect(validatePlan(p)).toEqual([]);
  });
});
