import { describe, it, expect } from "vitest";
import { isClassDay } from "./day-types";

describe("isClassDay", () => {
  it("is true for individual-class and group-class", () => {
    expect(isClassDay("individual-class")).toBe(true);
    expect(isClassDay("group-class")).toBe(true);
  });

  it("is false for sick days, plan ids, and unknown values", () => {
    expect(isClassDay("sick")).toBe(false);
    expect(isClassDay("0")).toBe(false);
    expect(isClassDay("")).toBe(false);
    expect(isClassDay("not-a-real-id")).toBe(false);
  });
});
