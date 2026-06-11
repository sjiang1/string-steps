# Draft email for teacher from selected practice notes — design

Issue: [#1](https://github.com/sjiang1/string-steps/issues/1)

## User story

As a parent, I want to send an email before class to mention any questions and
updates for the teacher to know, so that the teacher can start the class
prepared and the class can go more efficiently.

## Goal

On the existing teacher report page, let the parent **opt specific practice
notes into an email draft** for the teacher, then copy that draft to the
clipboard. Everything worth telling the teacher — including questions — already
lives in the daily practice notes, so this feature gathers, lets you pick, and
formats that material. It adds no new "questions" data concept.

This first version is **deterministic template assembly (no AI)**. The composed
draft doubles as a structured **context bundle** that a later AI-summary step
can consume — that is an explicit design goal, not just a side effect.

## Scope (v1)

- Note selection + an email draft on the existing teacher report page
  (`src/app/teacher/page.tsx`).
- Per-note inline checkboxes, **all OFF by default** — opt each note in.
- A live-updating draft preview + a copy-to-clipboard button.

## Out of scope (deferred)

- AI-generated prose summary. `composeTeacherEmail` is the single swap point.
- Sending email / `mailto:` / storing a teacher email address. Delivery is
  copy-to-clipboard only.

## Architecture

The server page keeps doing all data fetching and aggregation exactly as today
(the "since last class" `TeacherWindow`, per-track `progress`, and dated
`notes`, via `aggregateTeacherReport` → `TrackReport[]`). The report list
becomes interactive so it can hold selection state.

### 1. `composeTeacherEmail(...)` — pure formatter (`src/app/teacher-data.ts`)

A pure, total function (no throws, no I/O). It is the seam for the future AI
version.

```ts
type ComposeInput = {
  report: TrackReport[];          // existing aggregate
  selectedKeys: Set<string>;      // note keys that are checked
  studentName: string;
  teacherName: string;
};

function noteKey(trackId: string, date: string): string; // `${trackId}|${date}`
function composeTeacherEmail(input: ComposeInput): string;
```

Output — structured sections, plain text:

- **Greeting** line, always: `Hi {teacherName},`
- One **block per track that has at least one selected note**, in the report's
  existing track order:
  - track name (heading)
  - a progress line if the track has progress data, e.g.
    `Sing 3/5 · Play with track 2/4` (reuse the existing `progress` labels)
  - each **selected** note for that track, verbatim, with its short date:
    `Jun 9 — "bowing felt shaky"`
- **Sign-off** line, always: `Thanks!` / `— {studentName}`

Tracks whose notes are all unselected do not appear. The note key is
`trackId|date`, matching the `(trackId, date)` uniqueness of a note in the
report.

### 2. `TeacherEmailBuilder.tsx` — client component (`src/app/teacher/`)

Receives the already-computed `report`, `window`, `studentName`, `teacherName`
as props from the server page. Responsibilities:

- Render the report list (the markup currently inline in `page.tsx` moves here),
  adding a checkbox next to each note. Checkboxes start unchecked.
- Hold selection state as a `Set<string>` of note keys.
- Recompute the draft live via `composeTeacherEmail` on every toggle.
- Render the draft in a read-only `<textarea>` (or `<pre>`) and a **Copy**
  button using `navigator.clipboard.writeText`, with a transient "Copied!"
  confirmation. Child-friendly: large tap target.

The server `page.tsx` shrinks to: fetch + aggregate (unchanged) → render
`<TeacherEmailBuilder ... />`.

## Data flow

```
TeacherPage (server)
  ├─ getSchedule / getPlans / getTracks / getDoneTasks / getNotesInRange  (unchanged)
  ├─ computeTeacherWindow → aggregateTeacherReport → report: TrackReport[]
  └─ <TeacherEmailBuilder report window studentName teacherName />  (client)
        ├─ selection state: Set<noteKey>
        ├─ checkbox per note toggles the set
        ├─ draft = composeTeacherEmail({ report, selectedKeys, names })
        └─ Copy button → navigator.clipboard.writeText(draft)
```

## Edge cases

- **No notes selected** → draft is greeting + sign-off plus a neutral hint line
  (e.g. `(Check notes below to add them to this email.)`). Copy still yields a
  valid, if sparse, email.
- **Selected track with no progress data** → the note(s) render without a
  progress line (the block is still valid).
- **Clipboard write fails** (older browser / permissions) → fall back to
  selecting the textarea text and showing "Copy failed — select and copy
  manually."

## Testing

- Unit-test `composeTeacherEmail` (Vitest), covering:
  - multiple tracks, a mix of selected and unselected notes
  - a track included only when it has ≥1 selected note (unselected-only track
    omitted)
  - none-selected case (greeting + sign-off + hint, no track blocks)
  - a selected track with no progress data (note shown, no progress line)
  - track order matches the input report order
- Skip tests for the trivial checkbox / copy-button UI, per project preference
  for small UI changes.

## Future AI seam

The AI version replaces only `composeTeacherEmail`: it reads the same selected
`report` subset and returns prose instead of templated sections. Page wiring,
selection UI, and the copy flow are unchanged.
