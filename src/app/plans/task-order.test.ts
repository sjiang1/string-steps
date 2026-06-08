import { describe, it, expect } from "vitest";
import { sortTasks } from "./task-order";
import type { PlanTask } from "../plans";

function sig(tasks: PlanTask[]): string {
  return tasks
    .map((t) => (t.focus !== undefined ? `focus(${t.type}:${t.focus})` : t.type))
    .join(",");
}

describe("sortTasks", () => {
  it("orders sing, focus, playWithoutTrack, playWithTrack by default", () => {
    const input: PlanTask[] = [
      { type: "playWithTrack", count: 1 },
      { type: "sing", count: 1 },
      { type: "playWithoutTrack", count: 6, focus: "bars 5-8" },
      { type: "playWithoutTrack", count: 1 },
    ];
    expect(sig(sortTasks(input))).toBe(
      "sing,focus(playWithoutTrack:bars 5-8),playWithoutTrack,playWithTrack",
    );
  });

  it("keeps multiple focus tasks in their original relative order (stable)", () => {
    const input: PlanTask[] = [
      { type: "playWithoutTrack", count: 4, focus: "bars 12-14" },
      { type: "sing", count: 1 },
      { type: "playWithoutTrack", count: 6, focus: "bars 5-8" },
    ];
    expect(sig(sortTasks(input))).toBe(
      "sing,focus(playWithoutTrack:bars 12-14),focus(playWithoutTrack:bars 5-8)",
    );
  });

  it("places a focus task with type 'sing' in the focus slot, not the sing slot", () => {
    const input: PlanTask[] = [
      { type: "playWithTrack", count: 1 },
      { type: "sing", count: 1, focus: "tricky lyric" },
      { type: "sing", count: 1 },
    ];
    expect(sig(sortTasks(input))).toBe(
      "sing,focus(sing:tricky lyric),playWithTrack",
    );
  });

  it("returns a new array (non-mutating)", () => {
    const input: PlanTask[] = [
      { type: "playWithTrack", count: 1 },
      { type: "sing", count: 1 },
    ];
    const output = sortTasks(input);
    expect(output).not.toBe(input);
    expect(sig(input)).toBe("playWithTrack,sing");
  });

  it("handles an empty array", () => {
    expect(sortTasks([])).toEqual([]);
  });
});
