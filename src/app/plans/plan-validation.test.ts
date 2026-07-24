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

describe("validatePlan — die rules", () => {
  it("accepts a die item whose choices reference the pool and known rhythms", () => {
    const p = plan([
      {
        trackChoices: ["a", "b"],
        tasks: [],
        dice: true,
        dieChoices: [
          { kind: "track", trackId: "a" },
          { kind: "rhythm", rhythmId: "pepperoni" },
          { kind: "track", trackId: "b" },
        ],
      },
    ]);
    expect(validatePlan(p)).toEqual([]);
  });

  it("requires dieChoices when dice is on (missing or empty)", () => {
    expect(
      validatePlan(plan([{ trackChoices: ["a"], tasks: [], dice: true }])),
    ).toEqual([{ trackId: "a", reason: "die-choices-count" }]);
    expect(
      validatePlan(plan([{ trackChoices: ["a"], tasks: [], dice: true, dieChoices: [] }])),
    ).toEqual([{ trackId: "a", reason: "die-choices-count" }]);
  });

  it("rejects more than six die choices", () => {
    const seven = Array.from({ length: 7 }, () => ({
      kind: "rhythm" as const,
      rhythmId: "pepperoni",
    }));
    expect(
      validatePlan(plan([{ trackChoices: ["a"], tasks: [], dice: true, dieChoices: seven }])),
    ).toEqual([{ trackId: "a", reason: "die-choices-count" }]);
  });

  it("flags a track choice that is not in the item's pool", () => {
    const p = plan([
      {
        trackChoices: ["a"],
        tasks: [],
        dice: true,
        dieChoices: [{ kind: "track", trackId: "not-in-pool" }],
      },
    ]);
    expect(validatePlan(p)).toEqual([{ trackId: "a", reason: "die-track-not-in-pool" }]);
  });

  it("flags an unknown rhythm id", () => {
    const p = plan([
      {
        trackChoices: ["a"],
        tasks: [],
        dice: true,
        dieChoices: [{ kind: "rhythm", rhythmId: "mystery-rhythm" }],
      },
    ]);
    expect(validatePlan(p)).toEqual([{ trackId: "a", reason: "die-rhythm-unknown" }]);
  });

  it("flags duplicate tracks in the pool even without dice", () => {
    const p = plan([{ trackChoices: ["a", "a"], tasks: [], dice: false }]);
    expect(validatePlan(p)).toEqual([{ trackId: "a", reason: "duplicate-pool-track" }]);
  });

  it("ignores stray dieChoices when dice is off", () => {
    const p = plan([
      {
        trackChoices: ["a"],
        tasks: [],
        dice: false,
        dieChoices: [{ kind: "track", trackId: "not-in-pool" }],
      },
    ]);
    expect(validatePlan(p)).toEqual([]);
  });
});
