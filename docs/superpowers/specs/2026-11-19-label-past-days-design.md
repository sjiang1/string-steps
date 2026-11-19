# Labelling past days as class or sick days (#30)

**Issue:** https://github.com/sjiang1/string-steps/issues/30

## Intent

A class day sometimes goes unmarked until it has passed. Today the calendar refuses to label a past date (`setDayType` throws, and past cells are not tappable), so the only fix is editing `schedule:day` in the Upstash console. The Teacher report runs from the day after the last class day, so a missed label makes it cover the wrong stretch. Siyuan wants to fix a forgotten label in the app.

In real life a forgotten class day was a class day: no practice happened. So the schedule can stay one value per date and the label simply replaces the plan id that was auto-filled that day.

## Goals

- Any past date can be labelled with any of the day types (individual class, group class, sick), or have its label cleared, from the Calendar tab.
- The Teacher report reflects the corrected class day on its next load (it already reads the schedule live).
- A past day that has practice ticked on it cannot be relabelled; the sheet says why.

## Non-goals

- Storing both a label and a plan for one date.
- Limiting how far back a date may be edited (the calendar already navigates to any month).
- Any change to how today and future days are labelled.

## Anti-goal

Silently hiding practice that was logged. Hence the block below rather than a warning.

## Approaches considered

1. **Lift the rule only.** Smallest; ticks on a relabelled day would silently stop counting, and clearing a past label would leave the date empty. Rejected for those two surprises.
2. **Lift the rule, block when ticks exist, restore the plan on clear.** Chosen.
3. **Lift the rule with a warning instead of a block.** Siyuan prefers the block: if practice was ticked, the day is not to be switched.

## Design

**Rule.** A past date may be labelled or cleared unless the primary account's done log for that date has at least one entry. Linked accounts' ticks do not block, because their calendar and report already fall back to the previous plan on class days. The rule is enforced in the server action, not only in the UI.

**`setDayType(date, dayTypeId)` in `src/app/actions.ts`.**
- Drop the `date < today` rejection.
- Before writing, if `date < today` and `getDone(doneLogId(primary, date))` is non-empty, throw `Cannot relabel ${date}: practice was logged that day`.
- Clearing (`dayTypeId === null`) on a past date writes the most recent practice plan id before that date (`mostRecentPastPracticePlanIdAsOf(date, schedule)`) instead of deleting the entry, so the day goes back to being the practice day it would have been. If there is no earlier plan, delete the entry as today. Today and future dates keep the delete behaviour.

**Calendar UI (`src/app/calendar/CalendarGrid.tsx`, `DaySheet.tsx`).**
- Past cells become tappable like today's.
- The day sheet receives whether the date is blocked (primary ticks exist). When blocked, the day-type buttons are disabled and the footnote reads: "Practice was ticked on this day, so it can't be changed to a class or sick day." When the date is in the past and not blocked, the footnote reads: "Clearing a label puts the day back to the plan that was active then."
- The `/api/calendar` month payload already carries per-day progress; the sheet's blocked flag comes from the same data (a past practice day with any done count > 0). No new endpoint.

**Error path.** If the action throws (race: a tick arrived after the sheet opened), the sheet shows the raw error text and stays open, matching the project's "surface real errors" preference.

## Testing

- `actions.test.ts` (or the existing setDayType tests): past date without ticks → label written; past date with a primary tick → throws and the schedule is unchanged; past date with only a linked-account tick → label written; clearing a past label → previous plan id restored; clearing with no earlier plan → entry deleted; today/future unchanged.
- Calendar component test: past cell is tappable; blocked day shows disabled buttons and the explanatory note.
- Teacher window: no new test needed; `computeTeacherWindow` already picks up any class day in the schedule.

## Left to the builder

How the blocked state is threaded from the month payload into `DaySheet` (a prop computed in `CalendarGrid` is expected); exact wording layout in the sheet.
