# Rotating Practice Item Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A practice item can rotate through its track pool, asking for N tracks per day and suggesting the N that have waited longest since they were last fully practiced.

**Architecture:** One new optional field, `PracticeItem.perDay`. All rotation logic lives in a pure module, `src/app/rotation.ts`. It derives suggestions from the student's practice log, so nothing new is stored. The Practice page loads the last 30 days of the log only when the plan has a rotating item, works out suggestions on the server, and passes them to a new `RotatingItem` client component. The calendar and teacher view call the same pure helpers.

**Tech Stack:** Next.js 16 (app router, server actions), React, TypeScript, Tailwind, Vitest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-10-14-rotating-practice-item-design.md](../specs/2026-10-14-rotating-practice-item-design.md) — issue [#27](https://github.com/sjiang1/string-steps/issues/27), branch `27-rotating-practice-item`.

## Global Constraints

- A rotating item is valid only when `1 ≤ perDay < trackChoices.length`, `perDay` is an integer, and `dice` is false.
- The rotation advances on **practice days**: it is derived from the log, and days with no log entries change nothing.
- A track counts as practiced only when **every repetition of every task** is done.
- Today's log is excluded from suggestions, so they stay stable during a session.
- Each student has their own rotation (it is read from that student's own log via `doneLogId`).
- Child-friendly UI: large tap targets (at least `py-3` on tap rows), emoji, and it must work on phone, iPad and laptop.
- Calendar total for a rotating item = `perDay × tasks.length`.
- Commit messages describe how the files relate. End each one with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run checks with `npm test`, `npm run lint` and `npm run typecheck`.

## Review Focus

1. **Plan data hand-edited in Upstash with a bad `perDay`** (0, ≥ pool size, non-integer, or combined with dice): the Practice tab should treat the item as a normal item and not crash. → Task 1 `isRotating` tests.
2. **The teacher changes the item's task list in a new plan** (e.g. adds "sing"): the rotation should continue rather than restart. Each past day is judged against **that day's** plan item tasks, falling back to the current tasks. → Task 1 test "judges past days by that day's plan tasks".
3. **A track is added to the pool mid-rotation:** the new track has never been finished, so it is suggested first. → Task 1 test.
4. **The student finishes more than N tracks:** the day shows 100%, not more. The extra track still goes to the back of the line. → Task 1 (`tracksDoneToday`) and Task 7 tests.
5. **Removing tracks from the pool leaves `perDay` ≥ pool size:** the editor shows a validation error, keeps the Rotate control visible so it can be fixed, and blocks Save. → Tasks 2 and 3 tests.

---

### Task 1: Rotation core (pure logic)

**Files:**
- Modify: `src/app/plans.ts` (add `perDay` to `PracticeItem`)
- Create: `src/app/rotation.ts`
- Test: `src/app/rotation.test.ts`

**Interfaces:**
- Produces:
  - `PracticeItem.perDay?: number`
  - `ROTATION_LOOKBACK_DAYS = 30`
  - `isRotating(item: PracticeItem): boolean`
  - `trackFullyDone(trackId: string, tasks: PlanTask[], done: string[]): boolean`
  - `type HistoryDay = { date: string; done: string[]; plan?: Plan }`
  - `lastFullyDoneDate(trackId: string, item: PracticeItem, history: HistoryDay[]): string | null`
  - `suggestTracks(item: PracticeItem, history: HistoryDay[]): string[]`
  - `tracksDoneToday(item: PracticeItem, done: string[]): number`
  - `daysAgoLabel(last: string | null, today: string): string`
  - `type RotationView = { suggested: string[]; lastDoneLabel: Record<string, string> }`

- [ ] **Step 1: Add the field to `PracticeItem`** in `src/app/plans.ts`, after `speed`:

```ts
  perDay?: number; // rotating item: practice this many pool tracks per day (see rotation.ts)
```

- [ ] **Step 2: Write the failing tests** in `src/app/rotation.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to check they fail**

Run: `npx vitest run src/app/rotation.test.ts`
Expected: FAIL — `Cannot find module './rotation'`

- [ ] **Step 4: Write `src/app/rotation.ts`**

```ts
import type { Plan, PlanTask, PracticeItem } from "./plans";
import { doneCountForTask } from "./task-keys";

// How far back the Practice page reads the log to rank a rotating item's tracks.
// A track not finished within this window counts as never finished (first in line).
export const ROTATION_LOOKBACK_DAYS = 30;

// A rotating item practices `perDay` of its pool each day. Hand-edited plans can
// hold bad values, so anything invalid is treated as a normal item.
export function isRotating(item: PracticeItem): boolean {
  const n = item.perDay;
  return (
    n !== undefined &&
    Number.isInteger(n) &&
    n >= 1 &&
    n < item.trackChoices.length &&
    !item.dice
  );
}

export function trackFullyDone(trackId: string, tasks: PlanTask[], done: string[]): boolean {
  return tasks.length > 0 && tasks.every((t) => doneCountForTask(trackId, t, done) >= t.count);
}

// One past day of a student's log, with the plan that was scheduled that day.
export type HistoryDay = { date: string; done: string[]; plan?: Plan };

// A past day is judged by the tasks that day's plan asked for, so a task-list
// change in a new plan doesn't restart the rotation.
function tasksOn(day: HistoryDay, trackId: string, fallback: PlanTask[]): PlanTask[] {
  return day.plan?.items.find((i) => i.trackChoices.includes(trackId))?.tasks ?? fallback;
}

export function lastFullyDoneDate(
  trackId: string,
  item: PracticeItem,
  history: HistoryDay[],
): string | null {
  let last: string | null = null;
  for (const day of history) {
    if (last !== null && day.date <= last) continue;
    if (trackFullyDone(trackId, tasksOn(day, trackId, item.tasks), day.done)) last = day.date;
  }
  return last;
}

// The perDay tracks that waited longest: never-finished first, then oldest
// finish; ties keep pool order. `history` must hold only days before today.
export function suggestTracks(item: PracticeItem, history: HistoryDay[]): string[] {
  const ranked = item.trackChoices.map((id, index) => ({
    id,
    index,
    last: lastFullyDoneDate(id, item, history),
  }));
  ranked.sort((a, b) => {
    if (a.last !== b.last) {
      if (a.last === null) return -1;
      if (b.last === null) return 1;
      return a.last < b.last ? -1 : 1;
    }
    return a.index - b.index;
  });
  return ranked.slice(0, item.perDay).map((r) => r.id);
}

// Tracks finished today, capped at perDay — extra tracks don't overfill the item.
export function tracksDoneToday(item: PracticeItem, done: string[]): number {
  const full = item.trackChoices.filter((id) => trackFullyDone(id, item.tasks, done)).length;
  return Math.min(full, item.perDay ?? 0);
}

export function daysAgoLabel(last: string | null, today: string): string {
  if (last === null) return "not yet";
  const days = Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000);
  return days === 1 ? "✓ yesterday" : `✓ ${days} days ago`;
}

// What the Practice page needs for one rotating item, computed on the server.
export type RotationView = { suggested: string[]; lastDoneLabel: Record<string, string> };
```

- [ ] **Step 5: Run the tests to check they pass**

Run: `npx vitest run src/app/rotation.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/plans.ts src/app/rotation.ts src/app/rotation.test.ts
git commit -m "feat: rotation core for rotating practice items (#27)

plans.ts gains PracticeItem.perDay; rotation.ts ranks an item's pool by
when each track was last fully practiced in the log (judged by that day's
plan tasks) and suggests the perDay tracks that waited longest.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Plan validation for `perDay`

**Files:**
- Modify: `src/app/plans/plan-validation.ts`
- Modify: `src/app/plans/PlanEditor.tsx:222-242` (error messages)
- Test: `src/app/plans/plan-validation.test.ts`

**Interfaces:**
- Consumes: `PracticeItem.perDay` (Task 1)
- Produces: `PlanItemError.reason` gains `"rotation-per-day" | "rotation-with-dice"`

- [ ] **Step 1: Write the failing tests** by appending to the `describe("validatePlan")` block in `plan-validation.test.ts`:

```ts
  it("accepts a valid rotating item", () => {
    const p = plan([
      { trackChoices: ["a", "b", "c", "d"], tasks: [{ type: "sing", count: 1 }], dice: false, perDay: 2 },
    ]);
    expect(validatePlan(p)).toEqual([]);
  });

  it("flags perDay outside 1..pool-1 or not an integer", () => {
    for (const perDay of [0, 4, 5, 1.5]) {
      const p = plan([{ trackChoices: ["a", "b", "c", "d"], tasks: [], dice: false, perDay }]);
      expect(validatePlan(p)).toEqual([{ trackId: "a", reason: "rotation-per-day" }]);
    }
  });

  it("flags a single-track item left with perDay after its pool shrank", () => {
    const p = plan([{ trackChoices: ["a"], tasks: [], dice: false, perDay: 1 }]);
    expect(validatePlan(p)).toEqual([{ trackId: "a", reason: "rotation-per-day" }]);
  });

  it("flags rotation combined with the die", () => {
    const p = plan([
      {
        trackChoices: ["a", "b"],
        tasks: [],
        dice: true,
        dieChoices: [{ kind: "track", trackId: "a" }],
        perDay: 1,
      },
    ]);
    expect(validatePlan(p)).toEqual([{ trackId: "a", reason: "rotation-with-dice" }]);
  });
```

- [ ] **Step 2: Run them to check they fail**

Run: `npx vitest run src/app/plans/plan-validation.test.ts`
Expected: FAIL — the three error cases return `[]`.

- [ ] **Step 3: Implement.** In `plan-validation.ts`, widen the reason union:

```ts
  reason:
    | "die-choices-count"
    | "die-track-not-in-pool"
    | "die-rhythm-unknown"
    | "duplicate-pool-track"
    | "rotation-per-day"
    | "rotation-with-dice";
```

and add this inside the item loop, after the `if (item.dice) { … }` block:

```ts
    if (item.perDay !== undefined) {
      const n = item.perDay;
      if (!Number.isInteger(n) || n < 1 || n >= item.trackChoices.length) {
        errors.push({ trackId, reason: "rotation-per-day" });
      }
      if (item.dice) {
        errors.push({ trackId, reason: "rotation-with-dice" });
      }
    }
```

In `PlanEditor.tsx`, add a space at the end of the `duplicate-pool-track` message (`…pool. </span>`). Then add these after it:

```tsx
          {errors.some((e) => e.reason === "rotation-per-day") && (
            <span>A rotating item must practice fewer tracks per day than its pool holds (at least 1). </span>
          )}
          {errors.some((e) => e.reason === "rotation-with-dice") && (
            <span>An item can rotate or use the die, not both.</span>
          )}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run src/app/plans/plan-validation.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/plans/plan-validation.ts src/app/plans/plan-validation.test.ts src/app/plans/PlanEditor.tsx
git commit -m "feat: validate rotating items' perDay in the plan editor (#27)

plan-validation.ts rejects perDay outside 1..pool-1 and rotation with the
die; PlanEditor.tsx shows a message for each and blocks Save.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Plan editor Rotate control and copying plans

**Files:**
- Modify: `src/app/plans/PracticeItemRow.tsx` (Rotate control; enabling dice clears `perDay`)
- Modify: `src/app/plans/NewPlanButton.tsx:32-38` (copy `perDay`)
- Test: `src/app/plans/PracticeItemRow.test.tsx`, `src/app/plans/NewPlanButton.test.tsx`

**Interfaces:**
- Consumes: `PracticeItem.perDay` (Task 1)

- [ ] **Step 1: Write the failing tests.** Append to `PracticeItemRow.test.tsx`:

```tsx
describe("PracticeItemRow rotation", () => {
  const POOL_TRACKS: Track[] = ["p1", "p2", "p3", "p4"].map((id) => ({
    id,
    name: id.toUpperCase(),
    type: "reference" as const,
    file: null,
  }));
  const POOL: PracticeItem = { trackChoices: ["p1", "p2", "p3", "p4"], tasks: [], dice: false };

  function renderPoolRow(item: PracticeItem) {
    const onChange = vi.fn();
    render(
      <PracticeItemRow
        item={item}
        tracks={POOL_TRACKS}
        disabled={false}
        invalidTaskIndices={new Set()}
        onChange={onChange}
        onAddTrack={() => {}}
        onReplaceTrack={() => {}}
        onRemoveTrack={() => {}}
        onRemove={() => {}}
      />,
    );
    return onChange;
  }

  it("offers no Rotate control for a single-track item", () => {
    renderPoolRow({ ...POOL, trackChoices: ["p1"] });
    expect(screen.queryByLabelText("Rotate")).toBeNull();
  });

  it("turning Rotate on defaults to half the pool", () => {
    const onChange = renderPoolRow(POOL);
    fireEvent.click(screen.getByLabelText("Rotate"));
    expect(onChange).toHaveBeenCalledWith({ ...POOL, perDay: 2 });
  });

  it("changes the tracks-per-day number", () => {
    const onChange = renderPoolRow({ ...POOL, perDay: 2 });
    fireEvent.change(screen.getByLabelText("Tracks per day"), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith({ ...POOL, perDay: 3 });
  });

  it("turning Rotate off removes perDay", () => {
    const onChange = renderPoolRow({ ...POOL, perDay: 2 });
    fireEvent.click(screen.getByLabelText("Rotate"));
    expect(onChange).toHaveBeenCalledWith(POOL);
  });

  it("keeps the control visible when the pool shrank below perDay, so it can be fixed", () => {
    renderPoolRow({ ...POOL, trackChoices: ["p1"], perDay: 2 });
    expect(screen.getByLabelText("Rotate")).toBeTruthy();
  });

  it("enabling the die clears perDay", () => {
    const onChange = renderPoolRow({ ...POOL, perDay: 2 });
    fireEvent.click(screen.getByLabelText("Dice"));
    const next = onChange.mock.calls[0][0] as PracticeItem;
    expect(next.dice).toBe(true);
    expect(next.perDay).toBeUndefined();
  });
});
```

Append to `NewPlanButton.test.tsx`, inside `describe("NewPlanButton")`:

```tsx
  it("carries each item's perDay into the new plan", async () => {
    createPlan.mockClear();
    const source: Plan = {
      ...SOURCE,
      items: [{ trackChoices: ["a", "b", "c", "d"], tasks: [], dice: false, perDay: 2 }],
    };
    render(<NewPlanButton sourcePlan={source} defaultActiveFrom="2026-10-05" />);
    fireEvent.click(screen.getByRole("button", { name: "+ New plan" }));
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(createPlan).toHaveBeenCalled());
    const draft = (createPlan.mock.calls[0] as unknown as [Plan])[0];
    expect(draft.items[0].perDay).toBe(2);
  });
```

Note: `getByLabelText("Dice")` needs the existing Dice checkbox to be labelled. It's wrapped in `<label>…Dice</label>`, which Testing Library resolves. If it doesn't resolve, add `aria-label="Dice"` to that checkbox.

- [ ] **Step 2: Run them to check they fail**

Run: `npx vitest run src/app/plans/PracticeItemRow.test.tsx src/app/plans/NewPlanButton.test.tsx`
Expected: FAIL — no "Rotate" control, `perDay` undefined in the copied draft.

- [ ] **Step 3: Implement.** In `NewPlanButton.tsx`, add `perDay: it.perDay,` after `speed: it.speed,`.

In `PracticeItemRow.tsx`, change the Dice checkbox's enable branch so it drops `perDay`:

```tsx
            if (e.target.checked) {
              const next: PracticeItem = { ...item, dice: true, dieChoices: defaultDieChoices(item) };
              delete next.perDay;
              onChange(next);
            } else {
```

Insert the Rotate control just above the Dice `<label>`:

```tsx
      {(item.perDay !== undefined || (item.trackChoices.length > 1 && !item.dice)) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            id={`rotate-${primaryTrackId(item)}`}
            type="checkbox"
            aria-label="Rotate"
            checked={item.perDay !== undefined}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.checked) {
                onChange({ ...item, perDay: Math.max(1, Math.floor(item.trackChoices.length / 2)) });
              } else {
                const next: PracticeItem = { ...item };
                delete next.perDay;
                onChange(next);
              }
            }}
          />
          <label htmlFor={`rotate-${primaryTrackId(item)}`}>🔁 Rotate: practice</label>
          <input
            type="number"
            aria-label="Tracks per day"
            min={1}
            max={Math.max(1, item.trackChoices.length - 1)}
            value={item.perDay ?? Math.max(1, Math.floor(item.trackChoices.length / 2))}
            disabled={disabled || item.perDay === undefined}
            onChange={(e) => onChange({ ...item, perDay: Number(e.target.value) })}
            className="w-14 rounded border border-zinc-200 px-2 py-1 disabled:text-zinc-300"
          />
          <span>of {item.trackChoices.length} per day</span>
        </div>
      )}
```

- [ ] **Step 4: Run the tests, lint and typecheck**

Run: `npx vitest run src/app/plans && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/plans/PracticeItemRow.tsx src/app/plans/PracticeItemRow.test.tsx src/app/plans/NewPlanButton.tsx src/app/plans/NewPlanButton.test.tsx
git commit -m "feat: Rotate control in the plan editor (#27)

PracticeItemRow.tsx sets an item's perDay (enabling the die clears it);
NewPlanButton.tsx copies perDay so a new plan keeps the rotation.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reading a student's recent practice history

**Files:**
- Modify: `src/app/actions.ts` (add `getDoneHistory` after `getDoneTasks`)
- Test: `src/app/actions.test.ts`

**Interfaces:**
- Produces: `getDoneHistory(student: Student, beforeDate: string, days: number): Promise<{ date: string; done: string[] }[]>`. It returns the `days` dates before `beforeDate`, newest first, without `beforeDate` itself.

- [ ] **Step 1: Write the failing test.** Append to `actions.test.ts`:

```ts
describe("getDoneHistory", () => {
  it("returns the given number of days before the date, newest first, per student", async () => {
    writeFileSync(
      tempFile,
      JSON.stringify({
        "2026-10-13": ["p1-sing-0"],
        "2026-10-12": ["p2-sing-0"],
        "2026-10-14": ["today-sing-0"],
        "2026-10-13:linked-kid": ["linked-sing-0"],
      }),
    );
    const { getDoneHistory } = await loadActions();
    expect(await getDoneHistory(PRIMARY, "2026-10-14", 3)).toEqual([
      { date: "2026-10-13", done: ["p1-sing-0"] },
      { date: "2026-10-12", done: ["p2-sing-0"] },
      { date: "2026-10-11", done: [] },
    ]);
  });
});
```

(The `:linked-kid` key is another account's log entry; it checks that the primary student's history ignores other accounts.)

- [ ] **Step 2: Run it to check it fails**

Run: `npx vitest run src/app/actions.test.ts -t getDoneHistory`
Expected: FAIL — `getDoneHistory is not a function`

- [ ] **Step 3: Implement** in `actions.ts`, right after `getDoneTasks`:

```ts
// The student's done keys for the `days` dates before `beforeDate`, newest
// first — the input for ranking a rotating item's tracks. The file fallback
// reads sequentially because getDoneTasks may rewrite the shared log file.
export async function getDoneHistory(
  student: Student,
  beforeDate: string,
  days: number,
): Promise<{ date: string; done: string[] }[]> {
  const dates = Array.from({ length: days }, (_, i) => notesAddDays(beforeDate, -(i + 1)));
  if (redis) {
    return Promise.all(dates.map(async (date) => ({ date, done: await getDoneTasks(date, student) })));
  }
  const out: { date: string; done: string[] }[] = [];
  for (const date of dates) out.push({ date, done: await getDoneTasks(date, student) });
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/app/actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts src/app/actions.test.ts
git commit -m "feat: read a student's recent done log for rotation (#27)

actions.ts getDoneHistory returns the days before a date via getDoneTasks,
feeding rotation.ts suggestTracks on the Practice page.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Practice tab — the rotating item

**Files:**
- Create: `src/app/TrackMedia.tsx` (moves `SpeedAudio` and the video tag out of `PracticeTasksList.tsx` so both item kinds share them)
- Create: `src/app/RotatingItem.tsx`
- Modify: `src/app/TaskList.tsx` (optional `onDoneChange`)
- Modify: `src/app/PracticeTasksList.tsx` (new `rotation` prop; render `RotatingItem`)
- Modify: `src/app/page.tsx` (compute `RotationView`s)
- Test: `src/app/RotatingItem.test.tsx`

**Interfaces:**
- Consumes: `isRotating`, `suggestTracks`, `lastFullyDoneDate`, `daysAgoLabel`, `tracksDoneToday`, `ROTATION_LOOKBACK_DAYS`, `HistoryDay`, `RotationView` (Task 1); `getDoneHistory` (Task 4)
- Produces: `PracticeTasksList` prop `rotation?: Record<string, RotationView>`, keyed by `primaryTrackId(item)`

- [ ] **Step 1: Write the failing test** `src/app/RotatingItem.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { PracticeItem, Track } from "./plans";
import type { Student } from "./students";
import RotatingItem from "./RotatingItem";

vi.mock("./TaskList", () => ({
  default: ({ trackId }: { trackId: string }) => <div data-testid="task-list">{trackId}</div>,
}));
vi.mock("./TrackNote", () => ({ default: () => null }));

const TRACKS: Track[] = ["p1", "p2", "p3", "p4"].map((id) => ({
  id,
  name: `Piece ${id.slice(1)}`,
  type: "reference" as const,
  file: null,
}));
const ITEM: PracticeItem = {
  trackChoices: ["p1", "p2", "p3", "p4"],
  tasks: [{ type: "sing", count: 1 }],
  dice: false,
  perDay: 2,
};
const PRIMARY: Student = { id: "k", name: "K", emoji: "🎻", kind: "primary" };

function renderItem(doneTasks: string[] = []) {
  render(
    <RotatingItem
      item={ITEM}
      tracks={TRACKS}
      taskTypes={[]}
      doneTasks={doneTasks}
      notesByTrack={{}}
      activeStudent={PRIMARY}
      view={{
        suggested: ["p3", "p4"],
        lastDoneLabel: { p1: "✓ yesterday", p2: "✓ yesterday", p3: "not yet", p4: "not yet" },
      }}
    />,
  );
}

afterEach(cleanup);

describe("RotatingItem", () => {
  it("lists suggested tracks first, starred and open; others collapsed", () => {
    renderItem();
    const rows = screen.getAllByRole("button", { name: /Piece/ });
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("⭐"),
      expect.stringContaining("⭐"),
      expect.not.stringContaining("⭐"),
      expect.not.stringContaining("⭐"),
    ]);
    expect(rows[0].textContent).toContain("Piece 3");
    expect(screen.getAllByTestId("task-list").map((e) => e.textContent)).toEqual(["p3", "p4"]);
  });

  it("opens a collapsed track on tap", () => {
    renderItem();
    fireEvent.click(screen.getByRole("button", { name: /Piece 1/ }));
    expect(screen.getAllByTestId("task-list").map((e) => e.textContent)).toContain("p1");
  });

  it("titles an unnamed item by its rotation and counts tracks done today", () => {
    renderItem(["p1-sing-0"]);
    const header = screen.getByRole("heading");
    expect(header.textContent).toBe("🔁 2 of 4 tracks");
    expect(screen.getByText("1/2 tracks done today")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /Piece 1/ })).getByText("✓ yesterday")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to check it fails**

Run: `npx vitest run src/app/RotatingItem.test.tsx`
Expected: FAIL — `Cannot find module './RotatingItem'`

- [ ] **Step 3: Add `onDoneChange` to `TaskList.tsx`.** Add `onDoneChange` to the props destructuring and type (`onDoneChange?: (done: string[]) => void;`). Then right after `setDone(next);` in `advance`, add:

```ts
      onDoneChange?.(next);
```

- [ ] **Step 4: Extract `TrackMedia.tsx`.** Move `SpeedAudio` (with its comment) out of `PracticeTasksList.tsx` unchanged, and add:

```tsx
"use client";

import type { Track } from "./plans";

// …SpeedAudio moved here verbatim…

export default function TrackMedia({ track, speed }: { track: Track | undefined; speed: number }) {
  if (track?.type === "audio" && track.file) return <SpeedAudio src={track.file} speed={speed} />;
  if (track?.type === "video" && track.file) {
    return <video controls className="max-h-[400px] rounded mb-2" src={track.file} />;
  }
  return null;
}
```

In `PracticeTasksList.tsx`, delete `SpeedAudio`, import `TrackMedia`, and replace the two `{track?.type === "audio" …}` / `{track?.type === "video" …}` blocks with `<TrackMedia track={track} speed={speed} />`.

- [ ] **Step 5: Write `src/app/RotatingItem.tsx`**

```tsx
"use client";

import { useState } from "react";
import TaskList, { type TaskTypeDef } from "./TaskList";
import TrackMedia from "./TrackMedia";
import TrackNote from "./TrackNote";
import { itemOwnName, type PracticeItem, type Track } from "./plans";
import { tracksDoneToday, type RotationView } from "./rotation";
import type { Student } from "./students";

interface Props {
  item: PracticeItem;
  tracks: Track[];
  taskTypes: TaskTypeDef[];
  doneTasks: string[];
  notesByTrack: Record<string, string>;
  activeStudent: Student;
  view: RotationView;
}

// A rotating item shows every pool track: today's suggested ones first, starred
// and open; the rest collapsed but fully practicable. Any perDay finished
// tracks fill the item — the stars are only a suggestion.
export default function RotatingItem({ item, tracks, taskTypes, doneTasks, notesByTrack, activeStudent, view }: Props) {
  const [done, setDone] = useState(doneTasks);
  const [open, setOpen] = useState<Set<string>>(() => new Set(view.suggested));
  const perDay = item.perDay!;
  const ordered = [
    ...view.suggested,
    ...item.trackChoices.filter((id) => !view.suggested.includes(id)),
  ];
  const title = itemOwnName(item) ?? `🔁 ${perDay} of ${item.trackChoices.length} tracks`;

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <li className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h3 className="font-semibold">{title}</h3>
        <span className="ml-auto text-sm tabular-nums text-zinc-600">
          {tracksDoneToday(item, done)}/{perDay} tracks done today
        </span>
      </div>
      {item.teacherNote && (
        <p className="mb-2 text-sm italic text-zinc-600">👨‍🏫 {item.teacherNote}</p>
      )}
      <ul className="space-y-2">
        {ordered.map((id) => {
          const track = tracks.find((t) => t.id === id);
          const isOpen = open.has(id);
          const isSuggested = view.suggested.includes(id);
          return (
            <li key={id} className="rounded-md border border-zinc-200">
              <button
                onClick={() => toggle(id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 px-3 py-3 text-left"
              >
                <span aria-hidden>{isOpen ? "▾" : "▸"}</span>
                {isSuggested && <span>⭐</span>}
                <span className="font-medium">{track?.name ?? id}</span>
                <span className="ml-auto text-sm text-zinc-500">{view.lastDoneLabel[id]}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3">
                  <TaskList
                    trackId={id}
                    tasks={item.tasks}
                    taskTypes={taskTypes}
                    initialDone={done}
                    onDoneChange={setDone}
                  />
                  <TrackMedia track={track} speed={1} />
                  {activeStudent.kind === "primary" && (
                    <TrackNote trackId={id} initialNote={notesByTrack[id] ?? ""} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
```

(`initialDone={done}` matters: a TaskList that is collapsed and then reopened remounts with the latest log, not the page-load copy.)

- [ ] **Step 6: Wire it into `PracticeTasksList.tsx`.** Add `rotation?: Record<string, RotationView>;` to `Props` and to the destructuring, and import `RotatingItem` and `isRotating, type RotationView` from `./rotation`. At the top of the `items.map` callback, after `const itemKey = primaryTrackId(item);`:

```tsx
          const view = rotation?.[itemKey];
          if (isRotating(item) && view) {
            return (
              <RotatingItem
                key={itemKey}
                item={item}
                tracks={tracks}
                taskTypes={taskTypes}
                doneTasks={doneTasks}
                notesByTrack={notesByTrack}
                activeStudent={activeStudent}
                view={view}
              />
            );
          }
```

- [ ] **Step 7: Compute the views in `page.tsx`.** Add `getDoneHistory`, `getPlans` and `getSchedule` to the `./actions` import. Add `primaryTrackId` to the `./plans` import. Import `{ daysAgoLabel, isRotating, lastFullyDoneDate, ROTATION_LOOKBACK_DAYS, suggestTracks, type HistoryDay, type RotationView }` from `./rotation`. After `const plan = result.plan;`:

```tsx
  // Rotating items rank their pool from the student's recent log (before today).
  const rotation: Record<string, RotationView> = {};
  const rotatingItems = plan.items.filter(isRotating);
  if (rotatingItems.length > 0) {
    const [history, schedule, plans] = await Promise.all([
      getDoneHistory(activeStudent, today, ROTATION_LOOKBACK_DAYS),
      getSchedule(),
      getPlans(),
    ]);
    const days: HistoryDay[] = history.map((h) => ({
      ...h,
      plan: plans.find((p) => p.id === schedule[h.date]),
    }));
    for (const item of rotatingItems) {
      rotation[primaryTrackId(item)] = {
        suggested: suggestTracks(item, days),
        lastDoneLabel: Object.fromEntries(
          item.trackChoices.map((id) => [id, daysAgoLabel(lastFullyDoneDate(id, item, days), today)]),
        ),
      };
    }
  }
```

and pass `rotation={rotation}` to `<PracticeTasksList>`.

- [ ] **Step 8: Run all tests, lint and typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS (including the existing `PracticeTasksList.test.tsx`)

- [ ] **Step 9: Check it in the running app.** Run `npm run dev`. In `/plans`, give an item 4 tracks and turn on Rotate with 2 per day. Practice two tracks fully, then edit `data/practice-log.json` to move today's keys to yesterday's date. Reload `/`: the other two tracks should be starred and open. Also check it at phone width.

- [ ] **Step 10: Commit**

```bash
git add src/app/TrackMedia.tsx src/app/RotatingItem.tsx src/app/RotatingItem.test.tsx src/app/TaskList.tsx src/app/PracticeTasksList.tsx src/app/page.tsx
git commit -m "feat: rotating items on the Practice tab (#27)

page.tsx ranks each rotating item's pool from getDoneHistory and passes
the views to PracticeTasksList, which renders RotatingItem: suggested
tracks starred and open, the rest collapsed. TrackMedia is shared by both
item kinds; TaskList reports taps so the item header counts live.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Teacher view — days each pool track was practiced

**Files:**
- Modify: `src/app/teacher-data.ts` (`TrackReport.rotationDays`, `aggregateTeacherReport`, `composeTeacherEmail`)
- Modify: `src/app/teacher/TeacherEmailBuilder.tsx:62-69`
- Test: `src/app/teacher-data.test.ts`

**Interfaces:**
- Consumes: `isRotating`, `trackFullyDone` (Task 1)
- Produces: `TrackReport.rotationDays?: number`, set only for tracks in a rotating item

- [ ] **Step 1: Write the failing tests.** Append to `describe("aggregateTeacherReport")`:

```ts
  it("reports days fully practiced for each track of a rotating item", () => {
    const input: AggregateInput = {
      window: { startDate: "2026-04-15", endDate: "2026-04-16", bounded: false },
      schedule: { "2026-04-15": "1", "2026-04-16": "1" },
      plans: [
        { id: "1", createdDate: "2026-04-15", checklist: [], items: [
          { trackChoices: ["twinkle", "scale"], dice: false, perDay: 1,
            tasks: [{ type: "sing", count: 1 }] } ] },
      ],
      tracks,
      doneByDate: {
        "2026-04-15": ["twinkle-sing-0"],
        "2026-04-16": ["twinkle-sing-0"],
      },
      notesByDate: {},
    };

    const report = aggregateTeacherReport(input);
    expect(report).toEqual([
      { trackId: "twinkle", name: "Twinkle", progress: [], notes: [], rotationDays: 2 },
      { trackId: "scale", name: "A Major Scale", progress: [], notes: [], rotationDays: 0 },
    ]);
  });
```

Append to `describe("composeTeacherEmail")`:

```ts
  it("writes days practiced for a rotating track", () => {
    const email = composeTeacherEmail({
      ...names,
      report: [
        { trackId: "p1", name: "Piece 1", progress: [], rotationDays: 3,
          notes: [{ date: "2026-06-09", note: "smooth" }] },
      ],
      selectedKeys: new Set(["p1|2026-06-09"]),
    });
    expect(email).toContain("Piece 1\nPracticed fully on 3 days\n");
  });
```

- [ ] **Step 2: Run them to check they fail**

Run: `npx vitest run src/app/teacher-data.test.ts`
Expected: FAIL — the rotating item reports only `twinkle` with sing progress, and the email has no "Practiced fully" line.

- [ ] **Step 3: Implement** in `teacher-data.ts`. Import `{ isRotating, trackFullyDone } from "./rotation"`. Add `rotationDays?: number;` to `TrackReport`. In `aggregateTeacherReport`, declare `const rotationDates = new Map<string, Set<string>>();` next to `targets`. Then at the top of the `for (const item of plan.items)` loop:

```ts
      if (isRotating(item)) {
        for (const trackId of item.trackChoices) {
          if (!targets.has(trackId)) {
            targets.set(trackId, new Map());
            order.push(trackId);
          }
          if (!rotationDates.has(trackId)) rotationDates.set(trackId, new Set());
          if (trackFullyDone(trackId, item.tasks, doneByDate[date] ?? [])) {
            rotationDates.get(trackId)!.add(date);
          }
        }
        continue;
      }
```

Change the returned object to:

```ts
    const rotation = rotationDates.get(trackId);
    return {
      trackId,
      name,
      progress,
      notes,
      ...(rotation ? { rotationDays: rotation.size } : {}),
    };
```

In `composeTeacherEmail`, after the `if (track.progress.length > 0) { … }` block:

```ts
    if (track.rotationDays !== undefined) {
      lines.push(`Practiced fully on ${track.rotationDays} day${track.rotationDays === 1 ? "" : "s"}`);
    }
```

In `TeacherEmailBuilder.tsx`, inside the `text-sm text-zinc-600` div, after the `progress.map(…)`:

```tsx
              {entry.rotationDays !== undefined && (
                <span>
                  🔁 Practiced fully on {entry.rotationDays} day{entry.rotationDays === 1 ? "" : "s"}
                </span>
              )}
```

- [ ] **Step 4: Run the tests, lint and typecheck**

Run: `npx vitest run src/app/teacher-data.test.ts && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/teacher-data.ts src/app/teacher-data.test.ts src/app/teacher/TeacherEmailBuilder.tsx
git commit -m "feat: teacher view lists days each rotating track was practiced (#27)

teacher-data.ts reports rotationDays per pool track (via rotation.ts
trackFullyDone) instead of crediting only the item's first track; the
email draft and TeacherEmailBuilder.tsx show it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Calendar total for rotating items

> **Precondition:** #26 (count each task once) is merged to `main`, and this branch is rebased onto it (`git fetch && git rebase origin/main`). #26 replaces `planTaskTotal` and `doneTasks.length` in `getMonthProgress` with per-task counting. This task adds a rotating-item branch to that per-item count. If #26 isn't merged yet, stop here and tell Siyuan.

**Files:**
- Modify: `src/app/rotation.ts` (add `rotatingItemProgress`)
- Modify: `src/app/actions.ts` (`getMonthProgress`, wherever #26 counts an item's done/total)
- Test: `src/app/rotation.test.ts`, `src/app/actions.test.ts`

**Interfaces:**
- Consumes: `isRotating` (Task 1)
- Produces: `rotatingItemProgress(item: PracticeItem, done: string[]): { done: number; total: number }`, in finished-task units (#26's unit)

- [ ] **Step 1: Write the failing unit test.** Append to `rotation.test.ts` (add `rotatingItemProgress` to the import):

```ts
describe("rotatingItemProgress", () => {
  it("totals perDay × tasks and counts the best perDay tracks' finished tasks", () => {
    expect(rotatingItemProgress(FOUR, [])).toEqual({ done: 0, total: 4 });
    // p1 fully done (2 tasks), p3 half (sing only)
    expect(rotatingItemProgress(FOUR, [...fullKeys(["p1"]), "p3-sing-0"])).toEqual({ done: 3, total: 4 });
  });

  it("does not overfill when more than perDay tracks are done", () => {
    expect(rotatingItemProgress(FOUR, fullKeys(["p1", "p2", "p3"]))).toEqual({ done: 4, total: 4 });
  });
});
```

- [ ] **Step 2: Run it to check it fails**

Run: `npx vitest run src/app/rotation.test.ts`
Expected: FAIL — `rotatingItemProgress is not a function`

- [ ] **Step 3: Implement** in `rotation.ts`:

```ts
// Calendar progress for a rotating item, one unit per finished task (#26): the
// perDay tracks with the most finished tasks count, capped at perDay × tasks.
export function rotatingItemProgress(
  item: PracticeItem,
  done: string[],
): { done: number; total: number } {
  const perDay = item.perDay ?? 0;
  const total = perDay * item.tasks.length;
  const finishedPerTrack = item.trackChoices
    .map((id) => item.tasks.filter((t) => doneCountForTask(id, t, done) >= t.count).length)
    .sort((a, b) => b - a);
  const sum = finishedPerTrack.slice(0, perDay).reduce((s, n) => s + n, 0);
  return { done: Math.min(sum, total), total };
}
```

- [ ] **Step 4: Run the unit test**

Run: `npx vitest run src/app/rotation.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing integration test.** Append to the `getMonthProgress` describe in `actions.test.ts`, following the setup that #26's tests use there (`setupPlansData`, `setupScheduleData`, writing `tempFile`):

```ts
  it("counts a rotating item as perDay tracks' worth of tasks", async () => {
    setupPlansData([
      {
        id: "1",
        createdDate: "2026-04-07",
        items: [
          {
            trackChoices: ["p1", "p2", "p3", "p4"],
            tasks: [{ type: "sing", count: 1 }, { type: "playWithTrack", count: 2 }],
            dice: false,
            perDay: 2,
          },
        ],
        checklist: [],
      },
    ]);
    setupScheduleData({ "2026-04-09": "1" });
    writeFileSync(
      tempFile,
      JSON.stringify({
        "2026-04-09": [
          "p1-sing-0", "p1-playWithTrack-0", "p1-playWithTrack-1",
          "p2-sing-0", "p2-playWithTrack-0", "p2-playWithTrack-1",
          "p3-sing-0", "p3-playWithTrack-0", "p3-playWithTrack-1",
        ],
      }),
    );
    const { getMonthProgress } = await loadActions();
    const progress = await getMonthProgress("2026-04");
    expect(progress["2026-04-09"]).toEqual({ type: "practice", done: 4, total: 4 });
  });
```

- [ ] **Step 6: Run it to check it fails**

Run: `npx vitest run src/app/actions.test.ts -t "rotating item"`
Expected: FAIL — the total counts the item as a normal item.

- [ ] **Step 7: Implement.** In `getMonthProgress`, find where #26 works out one item's done and total. Add this branch before the normal-item path (import `isRotating, rotatingItemProgress` from `./rotation`):

```ts
    if (isRotating(item)) {
      const p = rotatingItemProgress(item, doneTasks);
      // add p.done and p.total into the day's sums the same way #26 adds a normal item's
    }
```

Do the same in the linked-account class-day fallback branch, which uses `fallbackPlan`. Name the variables after #26's code; the branch has to feed the same accumulators #26 uses.

- [ ] **Step 8: Run all tests, lint and typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/rotation.ts src/app/rotation.test.ts src/app/actions.ts src/app/actions.test.ts
git commit -m "feat: calendar counts rotating items as perDay tracks of tasks (#27)

rotation.ts rotatingItemProgress gives an item's done/total in #26's
per-task units; getMonthProgress in actions.ts uses it for rotating items.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: README

**Files:**
- Modify: `README.md` (new subsection after "### Practice Die")

- [ ] **Step 1: Add the section**

```markdown
### Rotating Items

A practice item with several tracks can **rotate**: in the Plans tab, turn on **🔁 Rotate** and pick how many tracks to practice per day (e.g. 2 of 4). Each day the Practice tab stars the tracks that have waited longest since they were last fully practiced, so 2 of 4 alternates pieces 1+2 and 3+4. The rotation only moves on days the student actually practices, and it carries over into the next plan. Every track stays visible and can be practiced; any N finished tracks fill the day. One task list applies to every track in the item. See the [design](docs/superpowers/specs/2026-10-14-rotating-practice-item-design.md).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README section for rotating items (#27)

Links the rotating-item design spec from the README feature list.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
