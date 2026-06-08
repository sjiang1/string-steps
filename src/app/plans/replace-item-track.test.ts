import { describe, it, expect } from "vitest";
import type { PracticeItem } from "../plans";
import { replaceItemTrack } from "./replace-item-track";

const items: PracticeItem[] = [
  { trackId: "a", tasks: [{ type: "sing", count: 2 }], dice: true, teacherNote: "keep me" },
  { trackId: "b", tasks: [], dice: false },
];

describe("replaceItemTrack", () => {
  it("swaps the trackId at the index, preserving tasks/dice/teacherNote", () => {
    const next = replaceItemTrack(items, 0, "c");
    expect(next[0]).toEqual({
      trackId: "c",
      tasks: [{ type: "sing", count: 2 }],
      dice: true,
      teacherNote: "keep me",
    });
  });

  it("leaves other items untouched", () => {
    const next = replaceItemTrack(items, 0, "c");
    expect(next[1]).toBe(items[1]);
  });

  it("does not mutate the input", () => {
    const next = replaceItemTrack(items, 0, "c");
    expect(items[0].trackId).toBe("a");
    expect(next).not.toBe(items);
  });
});
