import { describe, it, expect } from "vitest";
import type { Plan, PlanTask, PracticeItem } from "./plans";
import { tapKey } from "./task-keys";
import {
  daysAgoLabel,
  isRotating,
  lastFullyDoneDate,
  suggestTracks,
  trackFullyDone,
  tracksDoneToday,
  type HistoryDay,
} from "./rotation";

const TASKS: PlanTask[] = [
  { type: "sing", count: 1 },
  { type: "playWithTrack", count: 2 },
];

function item(pool: string[], perDay: number, tasks: PlanTask[] = TASKS): PracticeItem {
  return { trackChoices: pool, tasks, dice: false, perDay };
}

// Every repetition of every task for the given tracks.
function fullKeys(trackIds: string[], tasks: PlanTask[] = TASKS): string[] {
  return trackIds.flatMap((id) =>
    tasks.flatMap((t) => Array.from({ length: t.count }, (_, i) => tapKey(id, t, i))),
  );
}

const FOUR = item(["p1", "p2", "p3", "p4"], 2);

describe("isRotating", () => {
  it("is true for a valid N-of-M item", () => {
    expect(isRotating(FOUR)).toBe(true);
  });

  it("is false for bad perDay values or with the die on", () => {
    expect(isRotating({ ...FOUR, perDay: undefined })).toBe(false);
    expect(isRotating({ ...FOUR, perDay: 0 })).toBe(false);
    expect(isRotating({ ...FOUR, perDay: 4 })).toBe(false);
    expect(isRotating({ ...FOUR, perDay: 1.5 })).toBe(false);
    expect(isRotating({ ...FOUR, dice: true })).toBe(false);
  });
});

describe("trackFullyDone", () => {
  it("needs every repetition of every task", () => {
    expect(trackFullyDone("p1", TASKS, fullKeys(["p1"]))).toBe(true);
    expect(trackFullyDone("p1", TASKS, ["p1-sing-0", "p1-playWithTrack-0"])).toBe(false);
  });

  it("is false when a task has more taps than its target, like TaskList's ✅", () => {
    expect(trackFullyDone("p1", [{ type: "sing", count: 1 }], ["p1-sing-0", "p1-sing-1"])).toBe(false);
  });

  it("is false for an empty task list", () => {
    expect(trackFullyDone("p1", [], [])).toBe(false);
  });
});

describe("suggestTracks", () => {
  it("suggests the first N in pool order when nothing was practiced", () => {
    expect(suggestTracks(FOUR, [])).toEqual(["p1", "p2"]);
  });

  it("alternates 2 of 4 across practice days", () => {
    const day1: HistoryDay = { date: "2026-10-01", done: fullKeys(["p1", "p2"]) };
    expect(suggestTracks(FOUR, [day1])).toEqual(["p3", "p4"]);
    const day2: HistoryDay = { date: "2026-10-02", done: fullKeys(["p3", "p4"]) };
    expect(suggestTracks(FOUR, [day1, day2])).toEqual(["p1", "p2"]);
  });

  it("cycles 1 of 5", () => {
    const five = item(["a", "b", "c", "d", "e"], 1);
    const history: HistoryDay[] = [
      { date: "2026-10-01", done: fullKeys(["a"]) },
      { date: "2026-10-02", done: fullKeys(["b"]) },
    ];
    expect(suggestTracks(five, history)).toEqual(["c"]);
  });

  it("does not advance on a day with no practice", () => {
    const history: HistoryDay[] = [
      { date: "2026-10-01", done: fullKeys(["p1", "p2"]) },
      { date: "2026-10-02", done: [] },
    ];
    expect(suggestTracks(FOUR, history)).toEqual(["p3", "p4"]);
  });

  it("keeps a half-done track first in line", () => {
    const history: HistoryDay[] = [
      { date: "2026-10-01", done: [...fullKeys(["p2"]), "p1-sing-0"] },
    ];
    expect(suggestTracks(FOUR, history)).toEqual(["p1", "p3"]);
  });

  it("self-corrects after an off-list pick", () => {
    // Suggested p1+p2, but the student played p1+p3.
    const history: HistoryDay[] = [{ date: "2026-10-01", done: fullKeys(["p1", "p3"]) }];
    expect(suggestTracks(FOUR, history)).toEqual(["p2", "p4"]);
  });

  it("suggests a newly added pool track first", () => {
    const five = item(["p1", "p2", "p3", "p4", "p5"], 2);
    const history: HistoryDay[] = [
      { date: "2026-10-01", done: fullKeys(["p1", "p2"]) },
      { date: "2026-10-02", done: fullKeys(["p3", "p4"]) },
    ];
    expect(suggestTracks(five, history)).toEqual(["p5", "p1"]);
  });

  it("judges past days by that day's plan tasks", () => {
    const oldTasks: PlanTask[] = [{ type: "playWithTrack", count: 2 }];
    const oldPlan: Plan = {
      id: "1",
      createdDate: "2026-10-01",
      items: [item(["p1", "p2", "p3", "p4"], 2, oldTasks)],
      checklist: [],
    };
    // Today's item added "sing"; yesterday's p1+p2 were full under the old list.
    const history: HistoryDay[] = [
      { date: "2026-10-01", done: fullKeys(["p1", "p2"], oldTasks), plan: oldPlan },
    ];
    expect(suggestTracks(FOUR, history)).toEqual(["p3", "p4"]);
  });

  it("counts a track finished in a normal item the day before the rotation began", () => {
    const playTwice: PlanTask[] = [{ type: "playWithTrack", count: 2 }];
    const day1Plan: Plan = {
      id: "1",
      createdDate: "2026-10-01",
      items: [{ trackChoices: ["p1"], tasks: playTwice, dice: false }],
      checklist: [],
    };
    const pair = item(["p1", "p2"], 1, [{ type: "sing", count: 1 }]);
    // Judged by day 1's normal item (play ×2), not today's rotating tasks (sing).
    const history: HistoryDay[] = [
      { date: "2026-10-01", done: fullKeys(["p1"], playTwice), plan: day1Plan },
    ];
    expect(suggestTracks(pair, history)).toEqual(["p2"]);
  });

  it("skips a track that a normal item also finishes daily (accepted trade-off)", () => {
    const plan: Plan = {
      id: "1",
      createdDate: "2026-10-01",
      items: [{ trackChoices: ["p1"], tasks: TASKS, dice: false }, FOUR],
      checklist: [],
    };
    // p1 is finished every day by its normal item, so it always looks just practiced.
    const history: HistoryDay[] = [
      { date: "2026-10-02", done: fullKeys(["p1", "p4"]), plan },
      { date: "2026-10-01", done: fullKeys(["p1", "p2", "p3"]), plan },
    ];
    expect(suggestTracks(FOUR, history)).toEqual(["p2", "p3"]);
  });
});

describe("lastFullyDoneDate", () => {
  it("returns the latest full day regardless of history order", () => {
    const history: HistoryDay[] = [
      { date: "2026-10-03", done: fullKeys(["p1"]) },
      { date: "2026-10-01", done: fullKeys(["p1"]) },
    ];
    expect(lastFullyDoneDate("p1", FOUR, history)).toBe("2026-10-03");
    expect(lastFullyDoneDate("p2", FOUR, history)).toBeNull();
  });
});

describe("tracksDoneToday", () => {
  it("counts fully done tracks, capped at perDay", () => {
    expect(tracksDoneToday(FOUR, fullKeys(["p1"]))).toBe(1);
    expect(tracksDoneToday(FOUR, fullKeys(["p1", "p2", "p3"]))).toBe(2);
  });
});

describe("daysAgoLabel", () => {
  it("labels never, yesterday, and n days ago", () => {
    expect(daysAgoLabel(null, "2026-10-14")).toBe("not yet");
    expect(daysAgoLabel("2026-10-13", "2026-10-14")).toBe("✓ yesterday");
    expect(daysAgoLabel("2026-10-11", "2026-10-14")).toBe("✓ 3 days ago");
  });
});
