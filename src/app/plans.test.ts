import { describe, it, expect, beforeEach, vi } from "vitest";
import { TEST_PRIMARY as PRIMARY, TEST_LINKED as LINKED } from "./test-support/people";
import { primaryTrackId } from "./plans";

async function loadPlans() {
  const mod = await import("./plans");
  return mod;
}

beforeEach(() => {
  vi.resetModules();
});

describe("primaryTrackId", () => {
  it("returns the only track for a single-element pool", () => {
    expect(primaryTrackId({ trackChoices: ["twinkle"], tasks: [], dice: false })).toBe("twinkle");
  });

  it("returns the first track of a multi-track pool (pre-dice active track)", () => {
    expect(
      primaryTrackId({ trackChoices: ["twinkle", "minuet"], tasks: [], dice: false }),
    ).toBe("twinkle");
  });
});

describe("getPlanForDate — happy path", () => {
  it("returns the plan for a scheduled date", async () => {
    vi.doMock("./actions", () => ({
      getSchedule: async () => ({ "2026-04-07": "0" }),
      getPlans: async () => [
        { id: "0", createdDate: "2026-04-07", items: [{ trackChoices: ["x"], tasks: [], dice: false }], checklist: [] },
      ],
    }));
    const { getPlanForDate } = await loadPlans();
    const result = await getPlanForDate("2026-04-07");
    expect(result.ok).toBe(true);
    if (result.ok && "plan" in result) {
      expect(result.plan.id).toBe("0");
    }
  });
});

describe("getPlanForDate — INVALID_DATE_FORMAT", () => {
  it.each([["2026/04/10"], ["April 10, 2026"], ["2026-4-10"], [""], ["not-a-date"]])(
    "rejects %s",
    async (badDate) => {
      const { getPlanForDate } = await loadPlans();
      const result = await getPlanForDate(badDate);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_DATE_FORMAT");
        expect(result.error.message).toContain(badDate === "" ? '""' : badDate);
      }
    },
  );
});

describe("getPlanForDate — UNMAPPED_DATE", () => {
  it("returns UNMAPPED_DATE for a well-formed date not in the schedule", async () => {
    vi.doMock("./actions", () => ({
      getSchedule: async () => ({}),
      getPlans: async () => [],
    }));
    const { getPlanForDate } = await loadPlans();
    const result = await getPlanForDate("2025-01-01");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNMAPPED_DATE");
      expect(result.error.message).toContain("2025-01-01");
    }
  });
});

describe("getPlanForDate — non-practice day", () => {
  it("returns dayType for an individual class day", async () => {
    vi.doMock("./actions", () => ({
      getSchedule: async () => ({ "2026-04-09": "individual-class" }),
      getPlans: async () => [],
    }));
    const { getPlanForDate } = await loadPlans();
    const result = await getPlanForDate("2026-04-09");
    expect(result.ok).toBe(true);
    if (result.ok && "dayType" in result) {
      expect(result.dayType.id).toBe("individual-class");
    }
  });

  it("returns dayType for a group class day", async () => {
    vi.doMock("./actions", () => ({
      getSchedule: async () => ({ "2026-04-11": "group-class" }),
      getPlans: async () => [],
    }));
    const { getPlanForDate } = await loadPlans();
    const result = await getPlanForDate("2026-04-11");
    expect(result.ok).toBe(true);
    if (result.ok && "dayType" in result) {
      expect(result.dayType.id).toBe("group-class");
    }
  });

  it("returns dayType for a sick day", async () => {
    vi.doMock("./actions", () => ({
      getSchedule: async () => ({ "2026-04-20": "sick" }),
      getPlans: async () => [],
    }));
    const { getPlanForDate } = await loadPlans();
    const result = await getPlanForDate("2026-04-20");
    expect(result.ok).toBe(true);
    if (result.ok && "dayType" in result) {
      expect(result.dayType.id).toBe("sick");
    }
  });
});

describe("getPlanForDate — INVALID_PLAN_ID", () => {
  it("returns INVALID_PLAN_ID when the schedule points at a missing plan", async () => {
    vi.doMock("./actions", () => ({
      getSchedule: async () => ({ "2026-04-07": "42" }),
      getPlans: async () => [
        { id: "0", createdDate: "2026-04-07", items: [], checklist: [] },
      ],
    }));
    const { getPlanForDate } = await loadPlans();
    const result = await getPlanForDate("2026-04-07");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PLAN_ID");
      expect(result.error.message).toContain("2026-04-07");
      expect(result.error.message).toContain("42");
    }
  });
});

describe("mostRecentPastPracticePlanIdAsOf", () => {
  it("returns the latest past practice plan id", async () => {
    const { mostRecentPastPracticePlanIdAsOf } = await loadPlans();
    const id = mostRecentPastPracticePlanIdAsOf("2026-04-10", {
      "2026-04-07": "0",
      "2026-04-09": "1",
    });
    expect(id).toBe("1");
  });

  it("ignores past non-practice days when picking the fallback", async () => {
    const { mostRecentPastPracticePlanIdAsOf } = await loadPlans();
    const id = mostRecentPastPracticePlanIdAsOf("2026-04-10", {
      "2026-04-07": "0",
      "2026-04-09": "individual-class",
    });
    expect(id).toBe("0");
  });

  it("ignores future dates", async () => {
    const { mostRecentPastPracticePlanIdAsOf } = await loadPlans();
    const id = mostRecentPastPracticePlanIdAsOf("2026-04-10", {
      "2026-04-07": "0",
      "2026-04-15": "1",
    });
    expect(id).toBe("0");
  });

  it("excludes the target date itself", async () => {
    const { mostRecentPastPracticePlanIdAsOf } = await loadPlans();
    const id = mostRecentPastPracticePlanIdAsOf("2026-04-10", {
      "2026-04-10": "1",
    });
    expect(id).toBeNull();
  });

  it("returns null when no past practice plan exists", async () => {
    const { mostRecentPastPracticePlanIdAsOf } = await loadPlans();
    const id = mostRecentPastPracticePlanIdAsOf("2026-04-10", {
      "2026-04-09": "sick",
      "2026-04-11": "0",
    });
    expect(id).toBeNull();
  });
});

describe("resolvePracticePlanForDate", () => {
  it("returns the dayType for primary on a class day (no fallback)", async () => {
    vi.doMock("./actions", () => ({
      getSchedule: async () => ({ "2026-04-07": "0", "2026-04-09": "individual-class" }),
      getPlans: async () => [
        { id: "0", createdDate: "2026-04-07", items: [], checklist: [] },
      ],
    }));
    const { resolvePracticePlanForDate } = await loadPlans();
    const result = await resolvePracticePlanForDate("2026-04-09", PRIMARY);
    expect(result.ok).toBe(true);
    if (result.ok && "dayType" in result) {
      expect(result.dayType.id).toBe("individual-class");
    }
  });

  it("falls back to the most recent past practice plan for a linked account on a class day", async () => {
    vi.doMock("./actions", () => ({
      getSchedule: async () => ({ "2026-04-07": "0", "2026-04-09": "individual-class" }),
      getPlans: async () => [
        { id: "0", createdDate: "2026-04-07", items: [], checklist: [] },
      ],
    }));
    const { resolvePracticePlanForDate } = await loadPlans();
    const result = await resolvePracticePlanForDate("2026-04-09", LINKED);
    expect(result.ok).toBe(true);
    if (result.ok && "plan" in result) {
      expect(result.plan.id).toBe("0");
    }
  });

  it("returns the dayType for linked on a sick day (only class days unlock)", async () => {
    vi.doMock("./actions", () => ({
      getSchedule: async () => ({ "2026-04-07": "0", "2026-04-20": "sick" }),
      getPlans: async () => [
        { id: "0", createdDate: "2026-04-07", items: [], checklist: [] },
      ],
    }));
    const { resolvePracticePlanForDate } = await loadPlans();
    const result = await resolvePracticePlanForDate("2026-04-20", LINKED);
    expect(result.ok).toBe(true);
    if (result.ok && "dayType" in result) {
      expect(result.dayType.id).toBe("sick");
    }
  });

  it("returns the dayType for linked on a class day with no prior practice plan", async () => {
    vi.doMock("./actions", () => ({
      getSchedule: async () => ({ "2026-04-09": "individual-class" }),
      getPlans: async () => [],
    }));
    const { resolvePracticePlanForDate } = await loadPlans();
    const result = await resolvePracticePlanForDate("2026-04-09", LINKED);
    expect(result.ok).toBe(true);
    if (result.ok && "dayType" in result) {
      expect(result.dayType.id).toBe("individual-class");
    }
  });
});
