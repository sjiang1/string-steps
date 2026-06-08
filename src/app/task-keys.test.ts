import { describe, it, expect } from "vitest";
import { tapKey, doneCountForTask } from "./task-keys";
import type { PlanTask } from "./plans";

describe("tapKey", () => {
  it("formats a regular task key unchanged: trackId-type-rep", () => {
    const task: PlanTask = { type: "playWithTrack", count: 1 };
    expect(tapKey("scale", task, 0)).toBe("scale-playWithTrack-0");
  });

  it("formats a focus task key with a colon-separated focus label", () => {
    const task: PlanTask = { type: "playWithoutTrack", count: 6, focus: "bars 5-8" };
    expect(tapKey("may-song", task, 2)).toBe("may-song-playWithoutTrack:bars 5-8-2");
  });

  it("treats an empty focus string as a focus task (caller should have validated non-empty)", () => {
    const task: PlanTask = { type: "sing", count: 1, focus: "" };
    expect(tapKey("x", task, 0)).toBe("x-sing:-0");
  });
});

describe("doneCountForTask", () => {
  const done = [
    "scale-playWithTrack-0",
    "scale-playWithoutTrack-0",
    "scale-playWithoutTrack-1",
    "scale-playWithoutTrack:bars 5-8-0",
    "scale-playWithoutTrack:bars 5-8-1",
    "scale-playWithoutTrack:bars 5-8-2",
    "scale-playWithoutTrack:bars 12-14-0",
  ];

  it("counts a regular task and excludes focus-task keys of the same type", () => {
    const task: PlanTask = { type: "playWithoutTrack", count: 2 };
    expect(doneCountForTask("scale", task, done)).toBe(2);
  });

  it("counts a focus task by its exact (type, focus) pair", () => {
    const task: PlanTask = { type: "playWithoutTrack", count: 6, focus: "bars 5-8" };
    expect(doneCountForTask("scale", task, done)).toBe(3);
  });

  it("counts a different focus label independently", () => {
    const task: PlanTask = { type: "playWithoutTrack", count: 4, focus: "bars 12-14" };
    expect(doneCountForTask("scale", task, done)).toBe(1);
  });

  it("returns 0 when nothing matches", () => {
    const task: PlanTask = { type: "sing", count: 1 };
    expect(doneCountForTask("scale", task, done)).toBe(0);
  });

  it("does not match a different trackId", () => {
    const task: PlanTask = { type: "playWithTrack", count: 1 };
    expect(doneCountForTask("other", task, done)).toBe(0);
  });

  it("does not confuse prefixes: trackId 'scale' must not match 'scale-extra'", () => {
    const extra = [...done, "scale-extra-playWithTrack-0"];
    const task: PlanTask = { type: "playWithTrack", count: 1 };
    expect(doneCountForTask("scale", task, extra)).toBe(1);
  });
});
