# Rotating practice item — design

Issue: [#27](https://github.com/sjiang1/string-steps/issues/27)

## User story

The teacher wants the student to practice **2 of 4 tracks each day**, so that
every two days all four are covered: day 1 → pieces 1 + 2, day 2 → pieces 3 + 4,
day 3 → pieces 1 + 2 again, and so on.

## Goal

A practice item can **rotate** through a pool of tracks: it asks for N tracks
per day out of the pool, and suggests the N that have **waited longest** since
they were last fully practiced. It generalizes to any N of M (3 of 6, 1 of 5…).

## Decisions

| Question | Decision |
|---|---|
| What advances the rotation? | **Practice days**, not calendar days. Sick, class, or missed days leave no log entries, so the rotation pauses. |
| How is "today's group" chosen? | **Longest-waited first**, derived from the practice log — no stored pointer. |
| Tasks | **One shared task list** applies to every track in the pool. |
| What counts as "practiced"? | A track counts only when **all its tasks are finished** (every repetition). A half-done track stays first in line. |
| What does the student see? | **All tracks.** Suggested ones are marked ⭐ and open; the rest are collapsed rows that expand on tap. |
| Picking other tracks | **Implicit** — the student just practices any track. Any N finished tracks fill today's total; the ⭐ is only a suggestion. |
| Day total | **N × (number of tasks)** — counted the same way as every other item. |

## Design

### 1. Data model and plan editor

- New optional field on `PracticeItem` (`src/app/plans.ts`): `perDay?: number`.
  When set, the item is a **rotating item**: its `trackChoices` pool is the
  rotation and its `tasks` apply to each track.
- Validation (`src/app/plans/plan-validation.ts`):
  - `1 ≤ perDay < trackChoices.length`
  - `perDay` and `dice: true` are mutually exclusive
  - no per-item playback speed on a rotating item (that feature applies to a
    single track only)
- Plan editor: when an item has 2+ tracks and the die is off, show a
  **"🔁 Rotate: practice [N] per day"** control.
- "New plan from a source plan" must carry `perDay` over (watch for the same
  field-dropping class of bug as #23).

### 2. Suggesting today's tracks

A pure function, e.g. `suggestTracks(item, log, today, studentId): string[]`:

1. For each track in the pool, find the most recent date **strictly before
   today** on which the student finished every repetition of every task
   **that day's plan** asked for on that track (via `doneCountForTask` in
   `src/app/task-keys.ts`). "That day's tasks" = the first item in the plan
   scheduled that day whose `trackChoices` contains the track; if there is no
   such item (no plan that day, or the track wasn't in it), use today's item's
   tasks.
2. Sort tracks by that date, oldest first; never-finished tracks come first;
   ties keep pool order.
3. Return the first `perDay`.

Properties:

- **Plan-independent:** looks only at the per-track log, so the rotation
  carries over when next week's plan keeps the same tracks.
- **Stable during a session:** today is excluded, so ⭐ marks don't jump while
  the student practices.
- **Self-correcting:** if the student plays a non-suggested track, that track
  goes to the back of the line and the skipped one is suggested next time.
- **Per student:** a linked account has its own log, so its own rotation.
- **Judged as assigned:** a past day counts if the track got what *that day*
  asked for. A task-list change in a new plan (e.g. adding "sing", or raising
  play ×2 to ×4) doesn't restart the rotation.
- **Track, not item:** any finished practice of a track counts toward its turn,
  whichever item it came from: a normal item, a die item that rolled it, or an
  older plan. Example: day 1 has a normal item for piece 1; day 2 replaces it
  with a rotating item for pieces 1 + 2 (1 per day). If piece 1 was finished on
  day 1, day 2 suggests piece 2.
- **Accepted trade-off:** if a plan has a track both as a normal daily item and
  inside a rotation, the normal item finishes it every day, so it always looks
  "just practiced". The rotation skips it, except on a tie with tracks finished
  the same day, where pool order can still pick it. That slot is then already
  covered by the normal item. The setup is unusual, and the track is practiced
  daily anyway.

### 3. Practice tab

- Suggested tracks first, marked ⭐, with their task lists open.
- Other tracks below as collapsed rows (`Piece 1 · ✓ 2 days ago`) that expand on
  tap and can be fully practiced.
- Item header shows `x/N tracks done today`.

### 4. Counting

- **Calendar** (`getMonthProgress` in `src/app/actions.ts`): the item's total is
  `perDay × tasks.length`. Its done count = per-track finished-task counts,
  sorted descending, top `perDay` summed, capped at the total. Extra tracks
  beyond N are still logged (and so still move in the rotation) but don't push
  the total past 100%.
- **Depends on #26**, which changes task counting to one-per-task. Do #26 first
  so this builds on its counting code instead of changing the same function
  twice.
- **Teacher view** (`src/app/teacher-data.ts`): today it credits only an item's
  primary track. For a rotating item, list each pool track with **how many days
  it was fully practiced** since the last class day; no target count.

## Out of scope

- Combining rotation with the practice die.
- Per-track task overrides.
- An explicit "do today" toggle or saved picks.

## Testing

- `suggestTracks` (most of the logic): 2-of-4 alternation; 1-of-5 cycling;
  a skipped day does not advance; a half-done track stays first; an off-list
  pick corrects the order; rotation carries across plans; per-student logs.
- Validation rules for `perDay`.
- Calendar total/done math for a rotating item.
- Plan copy keeps `perDay`.
- No unit tests for the collapsed-row layout (small UI).
