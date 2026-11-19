# Label Past Days Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any past date be labelled as a class or sick day (or cleared) from the Calendar tab, blocked only when the primary account has practice ticked that day (#30).

**Architecture:** The schedule stays one value per date. `setDayType` drops its past-date rejection, refuses a past date whose primary done log is non-empty, and on clearing a past date writes back the most recent earlier practice plan. `getMonthProgress` adds a `ticked` flag to practice entries so the calendar can show the blocked state before the tap; the server action remains the authority and the day sheet surfaces its error text.

**Tech Stack:** Next.js 16 server actions, React client components, Vitest 4 + Testing Library (jsdom), file-backed stores in tests via `*_JSON_PATH` env vars.

**Spec:** `docs/superpowers/specs/2026-11-19-label-past-days-design.md`

## Global Constraints

- Block rule: a past date is blocked iff `getDoneTasks(date, primary)` is non-empty. Linked accounts' ticks never block.
- Error text when blocked: `Cannot relabel ${date}: practice was logged that day`.
- Clearing a past date writes `mostRecentPastPracticePlanIdAsOf(date, schedule)` when non-null; otherwise deletes the entry. Today and future dates always delete.
- Sheet copy, blocked: `Practice was ticked on this day, so it can't be changed to a class or sick day.`
- Sheet copy, past and not blocked: `Clearing a label puts the day back to the plan that was active then.`
- Sheet copy, today/future: unchanged (`Days you don't label become a normal practice day when that day arrives.`).
- Errors from the action are shown raw in the sheet (project preference: surface real errors).

## Review Focus

1. A tick lands after the sheet opened (stale `ticked: false`): the action throws, the sheet shows the error and stays open (Task 3 test "shows the action's error and stays open").
2. Clearing a past label when the day before it was a sick day: the restored plan skips non-practice days (Task 1 test "clearing a past label skips non-practice days when restoring").
3. Today with ticks is still editable (today is not past) (Task 1 test "labels today even when practice is ticked").
4. A linked account viewing the calendar: `ticked` reflects the primary's log, not the viewer's (Task 2 test "ticked follows the primary's log when a linked account is active").
5. A past date with no schedule entry at all (app never opened that day): labelling writes the label; clearing deletes nothing and throws nothing (Task 1 test "labels a past date that has no entry").

---

### Task 1: `setDayType` accepts past dates with the block and restore rules

**Files:**
- Modify: `src/app/actions.ts:116-131` (`setDayType`)
- Test: `src/app/actions.test.ts:758-802` (`describe("setDayType")`)

**Interfaces:**
- Consumes: `getPrimaryStudent()`, `getDoneTasks(date, student)` (both in `actions.ts`), `getScheduleMap()` from `./schedule`, `mostRecentPastPracticePlanIdAsOf(date, schedule)` from `./plans` (already imported? check; import if not).
- Produces: `setDayType(date: string, dayTypeId: string | null): Promise<void>` with the new behaviour; signature unchanged.

- [ ] **Step 1: Replace the "rejects a past date" test and add the new cases**

Inside the existing `describe("setDayType")` (fake time = 2026-06-15 in New York; `tempFile` is the primary's done log, keyed by plain date for the primary and `${date}:${LINKED.id}` for a linked account):

```ts
it("labels a past date that has no ticks", async () => {
  setupScheduleData({ "2026-06-01": "0" });
  const { setDayType, getSchedule } = await loadActions();
  await setDayType("2026-06-01", "individual-class");
  expect((await getSchedule())["2026-06-01"]).toBe("individual-class");
});

it("labels a past date that has no entry", async () => {
  setupScheduleData({});
  const { setDayType, getSchedule } = await loadActions();
  await setDayType("2026-06-01", "sick");
  expect((await getSchedule())["2026-06-01"]).toBe("sick");
  await setDayType("2026-06-01", null);
  expect((await getSchedule())["2026-06-01"]).toBeUndefined();
});

it("refuses a past date where the primary ticked practice, leaving the schedule alone", async () => {
  setupScheduleData({ "2026-06-01": "0" });
  writeFileSync(tempFile, JSON.stringify({ "2026-06-01": ["t-sing-0"] }));
  const { setDayType, getSchedule } = await loadActions();
  await expect(setDayType("2026-06-01", "individual-class")).rejects.toThrow(
    "Cannot relabel 2026-06-01: practice was logged that day",
  );
  expect((await getSchedule())["2026-06-01"]).toBe("0");
});

it("ignores a linked account's ticks when deciding", async () => {
  setupScheduleData({ "2026-06-01": "0" });
  writeFileSync(tempFile, JSON.stringify({ [`2026-06-01:${LINKED.id}`]: ["t-sing-0"] }));
  const { setDayType, getSchedule } = await loadActions();
  await setDayType("2026-06-01", "group-class");
  expect((await getSchedule())["2026-06-01"]).toBe("group-class");
});

it("labels today even when practice is ticked", async () => {
  setupScheduleData({ "2026-06-15": "0" });
  writeFileSync(tempFile, JSON.stringify({ "2026-06-15": ["t-sing-0"] }));
  const { setDayType, getSchedule } = await loadActions();
  await setDayType("2026-06-15", "individual-class");
  expect((await getSchedule())["2026-06-15"]).toBe("individual-class");
});

it("clearing a past label restores the plan that was active then", async () => {
  setupScheduleData({ "2026-05-30": "0", "2026-06-01": "1", "2026-06-02": "sick" });
  const { setDayType, getSchedule } = await loadActions();
  await setDayType("2026-06-02", null);
  expect((await getSchedule())["2026-06-02"]).toBe("1");
});

it("clearing a past label skips non-practice days when restoring", async () => {
  setupScheduleData({ "2026-05-30": "0", "2026-06-01": "sick", "2026-06-02": "individual-class" });
  const { setDayType, getSchedule } = await loadActions();
  await setDayType("2026-06-02", null);
  expect((await getSchedule())["2026-06-02"]).toBe("0");
});

it("clearing a past label with no earlier plan deletes the entry", async () => {
  setupScheduleData({ "2026-06-02": "sick" });
  const { setDayType, getSchedule } = await loadActions();
  await setDayType("2026-06-02", null);
  expect((await getSchedule())["2026-06-02"]).toBeUndefined();
});
```

Delete the old `it("rejects a past date", …)`. Keep the other four existing tests.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/app/actions.test.ts -t "setDayType"`
Expected: the past-date tests FAIL with `Cannot label a past date`; "refuses a past date where the primary ticked" FAILS because the thrown message differs; the today/future tests PASS.

- [ ] **Step 3: Implement in `src/app/actions.ts`**

In `setDayType`: compute `const today = todayLocal(); const past = date < today;`. Keep the unknown-day-type check. If `past`, read `getDoneTasks(date, await getPrimaryStudent())` and throw the blocked message when non-empty. For `dayTypeId === null`: if `past`, `const prev = mostRecentPastPracticePlanIdAsOf(date, await getScheduleMap())`; when `prev !== null` call `setScheduleEntry(date, prev)` and return; otherwise fall through to `deleteScheduleEntry(date)`. Update the function's comment (it currently says past days are read-only). `getScheduleMap` is imported from `./schedule` already (check the import list at the top; add if missing).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/app/actions.test.ts -t "setDayType"`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts src/app/actions.test.ts
git commit -m "feat: setDayType accepts past dates, blocked when practice was ticked (#30)

A past date can be labelled or cleared unless the primary's done log for
that day is non-empty; clearing a past label writes back the most recent
earlier practice plan instead of leaving the day empty."
```

---

### Task 2: `ticked` flag on practice entries in the month payload

**Files:**
- Modify: `src/app/actions.ts:182-233` (`MonthProgressEntry`, `getMonthProgress`)
- Test: `src/app/actions.test.ts:153-348` (`describe("getMonthProgress")`; reuse its plan/schedule seeding, see the first test there for the shape)

**Interfaces:**
- Produces: `MonthProgressEntry` practice variant becomes `{ type: "practice"; done: number; total: number; ticked: boolean }`. `ticked` is true iff the primary's done log for that date is non-empty.

- [ ] **Step 1: Write the failing tests** (inside `describe("getMonthProgress")`, following its existing setup for plans and schedule; `"0"` below stands for whatever plan id that describe seeds)

```ts
it("marks a day ticked when the primary logged anything, even an unfinished task", async () => {
  setupPlansData(TEST_PLANS);
  setupScheduleData({ "2026-06-01": "0" });
  writeFileSync(tempFile, JSON.stringify({ "2026-06-01": ["some-track:sing::0"] }));
  const { getMonthProgress } = await loadActions();
  const entry = (await getMonthProgress("2026-06"))["2026-06-01"];
  expect(entry).toMatchObject({ type: "practice", ticked: true });
});

it("marks a day not ticked when the primary's log is empty", async () => {
  setupPlansData(TEST_PLANS);
  setupScheduleData({ "2026-06-01": "0" });
  const { getMonthProgress } = await loadActions();
  expect((await getMonthProgress("2026-06"))["2026-06-01"]).toMatchObject({ ticked: false });
});

it("ticked follows the primary's log when a linked account is active", async () => {
  setupStudentsData([PRIMARY, LINKED]);
  cookieState.value = LINKED.id;
  setupPlansData(TEST_PLANS);
  setupScheduleData({ "2026-06-01": "0" });
  writeFileSync(tempFile, JSON.stringify({ [`2026-06-01:${LINKED.id}`]: ["some-track:sing::0"] }));
  const { getMonthProgress } = await loadActions();
  expect((await getMonthProgress("2026-06"))["2026-06-01"]).toMatchObject({ ticked: false });
});
```

Use the tap-key format the describe already uses for done entries (look at its first test); the exact key does not matter for `ticked`, only non-emptiness.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/app/actions.test.ts -t "getMonthProgress"`
Expected: the three new tests FAIL (`ticked` undefined); existing ones PASS.

- [ ] **Step 3: Implement**

In `getMonthProgress`: resolve `const primary = await getPrimaryStudent()` once. For each practice date, `const primaryDone = student.kind === "primary" ? doneTasks : await getDoneTasks(date, primary)` and set `ticked: primaryDone.length > 0`. Extend the `MonthProgressEntry` type.

- [ ] **Step 4: Run to verify they pass, then types**

Run: `npx vitest run src/app/actions.test.ts -t "getMonthProgress" && npx tsc --noEmit`
Expected: all pass; tsc may now flag `CalendarGrid.tsx` or other consumers constructing practice entries without `ticked` — fix those call sites by adding `ticked: false` only in test fixtures; production code gets the real value. If tsc is clean, nothing to do.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts src/app/actions.test.ts
git commit -m "feat: month progress says whether the primary ticked anything that day (#30)

getMonthProgress adds ticked to practice entries, read from the primary's
done log regardless of which account is viewing, so the calendar can show
a past day as blocked before the tap."
```

---

### Task 3: Calendar lets past days open, shows blocked state, surfaces errors

**Files:**
- Modify: `src/app/calendar/CalendarGrid.tsx:97-200`
- Modify: `src/app/calendar/DaySheet.tsx`
- Create: `src/app/calendar/DaySheet.test.tsx`
- Create: `src/app/calendar/CalendarGrid.test.tsx`
- Modify: `README.md` (Calendar section, line 82)

**Interfaces:**
- Consumes: `MonthProgressEntry.ticked` from Task 2; `setDayType` from Task 1 (throws the blocked message).
- Produces: `DaySheet` props become `{ date, currentDayTypeId, past: boolean, blocked: boolean, error: string | null, onApply, onClose }`.

- [ ] **Step 1: Write the failing DaySheet tests**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DaySheet from "./DaySheet";

afterEach(cleanup);

const base = { date: "2026-06-01", currentDayTypeId: null, error: null, onApply: vi.fn(), onClose: vi.fn() };

describe("DaySheet", () => {
  it("disables the labels and explains when the day is blocked", () => {
    render(<DaySheet {...base} past blocked />);
    for (const b of screen.getAllByRole("button", { name: /class|sick/i })) expect(b).toBeDisabled();
    expect(screen.getByText("Practice was ticked on this day, so it can't be changed to a class or sick day.")).toBeTruthy();
  });

  it("explains restore-on-clear for a past day that is not blocked", () => {
    render(<DaySheet {...base} past blocked={false} />);
    expect(screen.getByText("Clearing a label puts the day back to the plan that was active then.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /individual class/i }));
    expect(base.onApply).toHaveBeenCalledWith("individual-class");
  });

  it("keeps today's wording for today and future days", () => {
    render(<DaySheet {...base} past={false} blocked={false} />);
    expect(screen.getByText(/become a normal practice day/)).toBeTruthy();
  });

  it("shows the action's error text", () => {
    render(<DaySheet {...base} past blocked={false} error="Cannot relabel 2026-06-01: practice was logged that day" />);
    expect(screen.getByText("Cannot relabel 2026-06-01: practice was logged that day")).toBeTruthy();
  });
});
```

`toBeDisabled` needs jest-dom, which this repo does not have: use `expect((b as HTMLButtonElement).disabled).toBe(true)`.

- [ ] **Step 2: Write the failing CalendarGrid tests**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({ setDayType: vi.fn(async () => undefined) }));
vi.mock("../actions", () => actions);
import CalendarGrid from "./CalendarGrid";

const TODAY = "2026-06-15";
const progress = {
  "2026-06-01": { type: "practice" as const, done: 0, total: 3, ticked: false },
  "2026-06-02": { type: "practice" as const, done: 1, total: 3, ticked: true },
};

beforeEach(() => {
  actions.setDayType.mockReset().mockResolvedValue(undefined);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(progress)));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const grid = () => render(<CalendarGrid initialYear={2026} initialMonth={5} progress={progress} today={TODAY} />);

describe("CalendarGrid past days", () => {
  it("opens the sheet for a past day and saves a label", async () => {
    grid();
    fireEvent.click(screen.getByRole("button", { name: /^1$/ }));
    fireEvent.click(await screen.findByRole("button", { name: /individual class/i }));
    await waitFor(() => expect(actions.setDayType).toHaveBeenCalledWith("2026-06-01", "individual-class"));
  });

  it("opens a ticked past day as blocked", async () => {
    grid();
    fireEvent.click(screen.getByRole("button", { name: /^2$/ }));
    const b = (await screen.findByRole("button", { name: /individual class/i })) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });

  it("shows the action's error and stays open", async () => {
    actions.setDayType.mockRejectedValueOnce(new Error("Cannot relabel 2026-06-01: practice was logged that day"));
    grid();
    fireEvent.click(screen.getByRole("button", { name: /^1$/ }));
    fireEvent.click(await screen.findByRole("button", { name: /individual class/i }));
    expect(await screen.findByText(/Cannot relabel 2026-06-01/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /individual class/i })).toBeTruthy();
  });
});
```

The day-cell accessible name: check `DayCell` in `CalendarGrid.tsx:42-95`; if its text content is the day number plus an emoji/percentage, use `{ name: /^1\b/ }` or add `aria-label={String(day)}` to the cell button as part of this task.

- [ ] **Step 3: Run both files to verify they fail**

Run: `npx vitest run src/app/calendar`
Expected: DaySheet tests FAIL (props unknown / copy missing); CalendarGrid "opens the sheet for a past day" FAILS because the past cell is `disabled`.

- [ ] **Step 4: Implement**

- `CalendarGrid.tsx`: `tappable` becomes `true` for every cell (remove `date >= today`); add `const [error, setError] = useState<string | null>(null)`; `applyDayType` wraps `setDayType` in try/catch, on failure `setError(err instanceof Error ? err.message : String(err))` and returns without closing; on success clears the error and closes as now; `setPicking` resets `error` to null. Compute for the picked date: `past = picking < today`, `blocked = past && progress[picking]?.type === "practice" && progress[picking].ticked === true`. Pass `past`, `blocked`, `error` to `DaySheet`.
- `DaySheet.tsx`: accept the new props; `disabled={blocked}` on each day-type button (and `disabled:opacity-40`); footnote chooses among the three copies from Global Constraints; render `error` in a `<p className="mt-2 text-sm text-red-700">` when non-null.

- [ ] **Step 5: Run the calendar tests, the suite, types and lint**

Run: `npx vitest run src/app/calendar && npm test 2>&1 | tail -3 && npx tsc --noEmit && npx eslint src/app/calendar`
Expected: calendar 7 passed; suite green; no type or lint errors.

- [ ] **Step 6: README**

In the Calendar section (line 82) append: `Past days can be relabelled too, for a class day that was forgotten, unless practice was ticked that day; see the [design](docs/superpowers/specs/2026-11-19-label-past-days-design.md).`

- [ ] **Step 7: Commit**

```bash
git add src/app/calendar README.md
git commit -m "feat: calendar lets past days be labelled, blocked when practice was ticked (#30)

Past cells open the same day sheet; the sheet disables the labels and
explains when the month payload says the primary ticked that day, and
shows setDayType's raw error if a tick raced the sheet. README links
the design."
```

---

### Task 4: Manual check on the preview

- [ ] Open the Calendar on the preview, go back a month, tap a plain past day, label it Individual class: the cell turns blue and the Teacher tab's window now starts the day after it.
- [ ] Tap a past day with ticks: the sheet's labels are greyed out with the explanation.
- [ ] Clear the label from the day in step 1: the cell shows the practice colouring again.

Done when Siyuan reports the above on the PR.
