import { describe, it, expect } from "vitest";
import { anchorsTeacherReport, isClassDay } from "./day-types";

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

describe("anchorsTeacherReport", () => {
  it("is true only for individual-class", () => {
    expect(anchorsTeacherReport("individual-class")).toBe(true);
  });

  it("is false for group-class, sick days, plan ids, and unknown values", () => {
    expect(anchorsTeacherReport("group-class")).toBe(false);
    expect(anchorsTeacherReport("sick")).toBe(false);
    expect(anchorsTeacherReport("0")).toBe(false);
    expect(anchorsTeacherReport("")).toBe(false);
    expect(anchorsTeacherReport("not-a-real-id")).toBe(false);
  });
});
