import { describe, it, expect } from "vitest";
import {
  firstPracticeDayOnOrAfter,
  defaultActiveFrom,
  applyActiveFrom,
} from "./schedule-activation";

describe("firstPracticeDayOnOrAfter", () => {
  it("returns the date itself when it's an unmapped (practice) day", () => {
    expect(firstPracticeDayOnOrAfter({}, "2026-05-30")).toBe("2026-05-30");
  });
  it("returns the date itself when it's mapped to a plan", () => {
    expect(firstPracticeDayOnOrAfter({ "2026-05-30": "0" }, "2026-05-30")).toBe("2026-05-30");
  });
  it("skips consecutive non-practice days", () => {
    const schedule = { "2026-05-30": "individual-class", "2026-05-31": "sick" };
    expect(firstPracticeDayOnOrAfter(schedule, "2026-05-30")).toBe("2026-06-01");
  });
});

describe("defaultActiveFrom", () => {
  it("is today when today is an un-practiced practice day", () => {
    expect(defaultActiveFrom({}, "2026-05-30", false)).toBe("2026-05-30");
  });
  it("is the next practice day when today already has a log", () => {
    expect(defaultActiveFrom({}, "2026-05-30", true)).toBe("2026-05-31");
  });
  it("is the next practice day when today is a class day", () => {
    expect(defaultActiveFrom({ "2026-05-30": "individual-class" }, "2026-05-30", false)).toBe(
      "2026-05-31",
    );
  });
  it("skips non-practice days when finding the next practice day", () => {
    const schedule = { "2026-05-30": "individual-class", "2026-05-31": "individual-class" };
    expect(defaultActiveFrom(schedule, "2026-05-30", false)).toBe("2026-06-01");
  });
});

describe("applyActiveFrom", () => {
  it("anchors the plan at activeFrom", () => {
    expect(applyActiveFrom({}, "5", "2026-05-31")["2026-05-31"]).toBe("5");
  });
  it("remaps future practice entries from activeFrom forward, leaving earlier/past/non-practice days alone", () => {
    const schedule = {
      "2026-05-28": "0", // past practice — untouched
      "2026-05-30": "0", // before activeFrom — untouched
      "2026-06-01": "0", // after activeFrom, practice — remapped
      "2026-06-02": "individual-class", // after activeFrom, non-practice — untouched
      "2026-06-03": "0", // after activeFrom, practice — remapped
    };
    const next = applyActiveFrom(schedule, "5", "2026-05-31");
    expect(next).toEqual({
      "2026-05-28": "0",
      "2026-05-30": "0",
      "2026-05-31": "5",
      "2026-06-01": "5",
      "2026-06-02": "individual-class",
      "2026-06-03": "5",
    });
  });
  it("does not mutate the input schedule", () => {
    const schedule = { "2026-06-01": "0" };
    applyActiveFrom(schedule, "5", "2026-05-31");
    expect(schedule).toEqual({ "2026-06-01": "0" });
  });
});
