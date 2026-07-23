import { describe, it, expect } from "vitest";
import { rhythms, rhythmById } from "./rhythms";

describe("dice-rhythms seed", () => {
  it("every entry has a unique id", () => {
    const ids = rhythms.map((r) => r.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers faces 1–6 exactly once, in order", () => {
    expect(rhythms.map((r) => r.face)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("rhythmById finds an entry by id", () => {
    expect(rhythmById("pepperoni")?.face).toBe(1);
    expect(rhythmById("nope")).toBeUndefined();
  });
});
