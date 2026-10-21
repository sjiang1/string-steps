import { describe, it, expect } from "vitest";
import type { PracticeItem } from "../plans";
import { addPoolTrack, removePoolTrack, replacePoolTrack } from "./replace-item-track";

const items: PracticeItem[] = [
  {
    trackChoices: ["a", "b"],
    tasks: [{ type: "sing", count: 2 }],
    dice: true,
    dieChoices: [
      { kind: "track", trackId: "a" },
      { kind: "rhythm", rhythmId: "pepperoni" },
      { kind: "track", trackId: "b" },
    ],
    teacherNote: "keep me",
  },
  { trackChoices: ["c"], tasks: [], dice: false },
];

describe("addPoolTrack", () => {
  it("appends the track to the pool, preserving everything else", () => {
    const next = addPoolTrack(items, 1, "d");
    expect(next[1]).toEqual({ trackChoices: ["c", "d"], tasks: [], dice: false });
    expect(next[0]).toBe(items[0]);
  });
});

describe("replacePoolTrack", () => {
  it("swaps the pool entry and rewrites matching die choices to the new id", () => {
    const next = replacePoolTrack(items, 0, "b", "z");
    expect(next[0].trackChoices).toEqual(["a", "z"]);
    expect(next[0].dieChoices).toEqual([
      { kind: "track", trackId: "a" },
      { kind: "rhythm", rhythmId: "pepperoni" },
      { kind: "track", trackId: "z" },
    ]);
    expect(next[0].tasks).toEqual([{ type: "sing", count: 2 }]);
    expect(next[0].teacherNote).toBe("keep me");
  });

  it("leaves items without dieChoices untouched apart from the pool", () => {
    const next = replacePoolTrack(items, 1, "c", "z");
    expect(next[1]).toEqual({ trackChoices: ["z"], tasks: [], dice: false });
    expect("dieChoices" in next[1]).toBe(false);
  });

  it("leaves other items untouched and does not mutate the input", () => {
    const next = replacePoolTrack(items, 0, "b", "z");
    expect(next[1]).toBe(items[1]);
    expect(items[0].trackChoices).toEqual(["a", "b"]);
    expect(next).not.toBe(items);
  });
});

describe("removePoolTrack", () => {
  it("drops the pool entry and any die choices that referenced it", () => {
    const next = removePoolTrack(items, 0, "b");
    expect(next[0].trackChoices).toEqual(["a"]);
    expect(next[0].dieChoices).toEqual([
      { kind: "track", trackId: "a" },
      { kind: "rhythm", rhythmId: "pepperoni" },
    ]);
  });

  it("does not mutate the input", () => {
    removePoolTrack(items, 0, "b");
    expect(items[0].trackChoices).toEqual(["a", "b"]);
    expect(items[0].dieChoices).toHaveLength(3);
  });
});

describe("pool edits keep playback speeds", () => {
  it("moves a single-track item's speed onto that track when a second track is added", () => {
    const items: PracticeItem[] = [{ trackChoices: ["a"], tasks: [], dice: false, speed: 0.75 }];
    const [next] = addPoolTrack(items, 0, "b");
    expect(next.speed).toBeUndefined();
    expect(next.trackSpeeds).toEqual({ a: 0.75 });
  });

  it("drops a removed track's speed", () => {
    const items: PracticeItem[] = [
      { trackChoices: ["a", "b", "c"], tasks: [], dice: false, trackSpeeds: { a: 0.5, b: 0.75 } },
    ];
    const [next] = removePoolTrack(items, 0, "b");
    expect(next.trackSpeeds).toEqual({ a: 0.5 });
  });

  it("moves the last track's speed back to the item when the pool shrinks to one", () => {
    const items: PracticeItem[] = [
      { trackChoices: ["a", "b"], tasks: [], dice: false, trackSpeeds: { a: 0.5, b: 0.75 } },
    ];
    const [next] = removePoolTrack(items, 0, "a");
    expect(next.speed).toBe(0.75);
    expect(next.trackSpeeds).toBeUndefined();
  });

  it("keeps a replaced track's speed on the new track", () => {
    const items: PracticeItem[] = [
      { trackChoices: ["a", "b"], tasks: [], dice: false, trackSpeeds: { a: 0.5 } },
    ];
    const [next] = replacePoolTrack(items, 0, "a", "z");
    expect(next.trackSpeeds).toEqual({ z: 0.5 });
  });
});
