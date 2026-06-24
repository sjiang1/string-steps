# Draft email for teacher from selected practice notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the teacher report page, let the parent opt specific practice notes into a deterministically-composed email draft and copy it to the clipboard.

**Architecture:** A pure formatter `composeTeacherEmail` (the future-AI swap point) lives in `src/app/teacher-data.ts`. A new client component `TeacherEmailBuilder` holds per-note selection state, re-composes the draft live, and renders the report list (moved out of `page.tsx`) plus a copy button. The server `page.tsx` keeps all data fetching/aggregation and just renders the client component.

**Tech Stack:** Next.js (App Router, server + client components), React (`useState`/`useMemo`), TypeScript, Tailwind, Vitest.

Spec: [docs/superpowers/specs/2026-06-11-teacher-email-draft-design.md](../specs/2026-06-11-teacher-email-draft-design.md) · Issue [#1](https://github.com/sjiang1/string-steps/issues/1)

---

## File Structure

- **`src/app/teacher-data.ts`** (modify) — add `noteKey()` and `composeTeacherEmail()` plus the `ComposeInput` type. Pure, no I/O. Reuses existing `TrackReport`, `formatShort`.
- **`src/app/teacher-data.test.ts`** (modify) — add a `describe("composeTeacherEmail")` block with the unit cases from the spec's Testing section.
- **`src/app/teacher/TeacherEmailBuilder.tsx`** (create) — `"use client"` component: report list with per-note checkboxes, live draft `<textarea>`, copy button.
- **`src/app/teacher/page.tsx`** (modify) — fetch the teacher name, drop the inline report list, render `<TeacherEmailBuilder ... />`.

---

## Task 1: `noteKey` + `composeTeacherEmail` pure formatter (TDD)

**Files:**
- Modify: `src/app/teacher-data.ts` (add types + functions after the existing `aggregateTeacherReport`, near line 157)
- Test: `src/app/teacher-data.test.ts` (append a new `describe` block)

The output format (plain text, straight quotes — this is an email body, not the page's curly-quote display):

```
Hi Mr. Graham,

Twinkle Twinkle
Sing 3/5 · Play with track 2/4
Jun 9 — "bowing felt shaky"
Jun 10 — "much better today"

Minuet
Sing 1/2
Jun 9 — "forgot the repeat"

Thanks!
— Xiami
```

Rules:
- Greeting `Hi {teacherName},` always first; sign-off `Thanks!\n— {studentName}` always last.
- One block per track **that has ≥1 selected note**, in `report` order. Block = track name line, an optional progress line (`{label} {done}/{total}` joined by ` · `, omitted when `progress` is empty), then one line per **selected** note: `{formatShort(date)} — "{note}"`.
- None-selected → greeting, a hint line `(Check notes below to add them to this email.)`, sign-off.
- Sections (greeting, each track block, sign-off, or the hint) are joined by a blank line (`\n\n`).

- [ ] **Step 1: Write the failing tests**

Append to `src/app/teacher-data.test.ts`. First extend the import on line 2 to include the new functions:

```ts
import {
  addDays,
  datesInRange,
  computeTeacherWindow,
  noteKey,
  composeTeacherEmail,
} from "./teacher-data";
```

Then add at the end of the file:

```ts
describe("noteKey", () => {
  it("joins trackId and date with a pipe", () => {
    expect(noteKey("twinkle", "2026-06-09")).toBe("twinkle|2026-06-09");
  });
});

describe("composeTeacherEmail", () => {
  const report = [
    {
      trackId: "twinkle",
      name: "Twinkle Twinkle",
      progress: [
        { type: "sing", label: "Sing", done: 3, total: 5 },
        { type: "playWithTrack", label: "Play with track", done: 2, total: 4 },
      ],
      notes: [
        { date: "2026-06-09", note: "bowing felt shaky" },
        { date: "2026-06-10", note: "much better today" },
      ],
    },
    {
      trackId: "minuet",
      name: "Minuet",
      progress: [{ type: "sing", label: "Sing", done: 1, total: 2 }],
      notes: [{ date: "2026-06-09", note: "forgot the repeat" }],
    },
  ];
  const names = { studentName: "Xiami", teacherName: "Mr. Graham" };

  it("includes only tracks with at least one selected note, in report order", () => {
    const selectedKeys = new Set([
      "twinkle|2026-06-09",
      "twinkle|2026-06-10",
      "minuet|2026-06-09",
    ]);
    expect(composeTeacherEmail({ report, selectedKeys, ...names })).toBe(
      [
        "Hi Mr. Graham,",
        "",
        "Twinkle Twinkle",
        "Sing 3/5 · Play with track 2/4",
        'Jun 9 — "bowing felt shaky"',
        'Jun 10 — "much better today"',
        "",
        "Minuet",
        "Sing 1/2",
        'Jun 9 — "forgot the repeat"',
        "",
        "Thanks!",
        "— Xiami",
      ].join("\n"),
    );
  });

  it("omits a track whose notes are all unselected", () => {
    const selectedKeys = new Set(["minuet|2026-06-09"]);
    const out = composeTeacherEmail({ report, selectedKeys, ...names });
    expect(out).not.toContain("Twinkle Twinkle");
    expect(out).toContain("Minuet");
  });

  it("includes only the selected notes within an included track", () => {
    const selectedKeys = new Set(["twinkle|2026-06-10"]);
    const out = composeTeacherEmail({ report, selectedKeys, ...names });
    expect(out).toContain('Jun 10 — "much better today"');
    expect(out).not.toContain("bowing felt shaky");
  });

  it("renders greeting + hint + sign-off when nothing is selected", () => {
    const out = composeTeacherEmail({
      report,
      selectedKeys: new Set(),
      ...names,
    });
    expect(out).toBe(
      [
        "Hi Mr. Graham,",
        "",
        "(Check notes below to add them to this email.)",
        "",
        "Thanks!",
        "— Xiami",
      ].join("\n"),
    );
  });

  it("omits the progress line for a selected track with no progress data", () => {
    const noProgress = [
      {
        trackId: "etude",
        name: "Etude",
        progress: [],
        notes: [{ date: "2026-06-09", note: "new piece" }],
      },
    ];
    const out = composeTeacherEmail({
      report: noProgress,
      selectedKeys: new Set(["etude|2026-06-09"]),
      ...names,
    });
    expect(out).toBe(
      [
        "Hi Mr. Graham,",
        "",
        "Etude",
        'Jun 9 — "new piece"',
        "",
        "Thanks!",
        "— Xiami",
      ].join("\n"),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/teacher-data.test.ts`
Expected: FAIL — `noteKey` / `composeTeacherEmail` are not exported (import error or "is not a function").

- [ ] **Step 3: Implement `noteKey` and `composeTeacherEmail`**

Add to `src/app/teacher-data.ts` (after `aggregateTeacherReport`, at the end of the file). It reuses the existing `TrackReport` type and `formatShort` function already defined in this file:

```ts
export type ComposeInput = {
  report: TrackReport[];
  selectedKeys: Set<string>;
  studentName: string;
  teacherName: string;
};

export function noteKey(trackId: string, date: string): string {
  return `${trackId}|${date}`;
}

export function composeTeacherEmail(input: ComposeInput): string {
  const { report, selectedKeys, studentName, teacherName } = input;
  const sections: string[] = [`Hi ${teacherName},`];

  const blocks: string[] = [];
  for (const track of report) {
    const selectedNotes = track.notes.filter((n) =>
      selectedKeys.has(noteKey(track.trackId, n.date)),
    );
    if (selectedNotes.length === 0) continue;

    const lines: string[] = [track.name];
    if (track.progress.length > 0) {
      lines.push(
        track.progress.map((p) => `${p.label} ${p.done}/${p.total}`).join(" · "),
      );
    }
    for (const n of selectedNotes) {
      lines.push(`${formatShort(n.date)} — "${n.note}"`);
    }
    blocks.push(lines.join("\n"));
  }

  if (blocks.length === 0) {
    sections.push("(Check notes below to add them to this email.)");
  } else {
    sections.push(...blocks);
  }

  sections.push(`Thanks!\n— ${studentName}`);
  return sections.join("\n\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/teacher-data.test.ts`
Expected: PASS — all `noteKey` and `composeTeacherEmail` cases green, existing cases still green.

- [ ] **Step 5: Commit**

```bash
git add src/app/teacher-data.ts src/app/teacher-data.test.ts
git commit -m "feat: add composeTeacherEmail formatter for teacher email draft

Pure formatter + noteKey helper in teacher-data.ts, the swap point for a
future AI summary. Unit-tested in teacher-data.test.ts."
```

---

## Task 2: `TeacherEmailBuilder` client component

Per the project preference, skip unit tests for the trivial checkbox/copy-button UI; verify it by running the app in Task 3.

**Files:**
- Create: `src/app/teacher/TeacherEmailBuilder.tsx`

- [ ] **Step 1: Create the component**

This moves the report-list markup currently inline in `page.tsx` (lines 60–94) here and adds a checkbox per note, a live draft, and a copy button. Selection state is a `Set<string>` of note keys; the draft is recomputed with `useMemo`.

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  composeTeacherEmail,
  formatShort,
  noteKey,
  type TrackReport,
} from "../teacher-data";

export default function TeacherEmailBuilder({
  report,
  studentName,
  teacherName,
}: {
  report: TrackReport[];
  studentName: string;
  teacherName: string;
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  function toggle(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setCopied("idle");
  }

  const draft = useMemo(
    () => composeTeacherEmail({ report, selectedKeys, studentName, teacherName }),
    [report, selectedKeys, studentName, teacherName],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <ul className="space-y-4">
        {report.map((entry) => (
          <li key={entry.trackId} className="rounded-lg border bg-white p-4">
            <div className="font-semibold mb-1">{entry.name}</div>
            <div className="text-sm text-zinc-600">
              {entry.progress.map((p, i) => (
                <span key={p.type}>
                  {i > 0 && " · "}
                  {p.label} {p.done}/{p.total}
                </span>
              ))}
            </div>
            {entry.notes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {entry.notes.map((n) => {
                  const key = noteKey(entry.trackId, n.date);
                  return (
                    <li key={n.date}>
                      <label className="flex items-start gap-3 text-sm italic text-zinc-500">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(key)}
                          onChange={() => toggle(key)}
                          className="mt-1 h-5 w-5 shrink-0"
                        />
                        <span>
                          {formatShort(n.date)} — “{n.note}”
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
        {report.length === 0 && (
          <li className="text-zinc-500">
            No tracks were scheduled in this window.
          </li>
        )}
      </ul>

      <div className="space-y-3">
        <h2 className="font-semibold">✉️ Email draft</h2>
        <textarea
          readOnly
          value={draft}
          rows={16}
          className="w-full resize-none rounded-lg border border-zinc-200 bg-white p-3 font-mono text-sm"
        />
        <button
          onClick={copy}
          className="rounded-lg bg-blue-600 px-5 py-3 text-base font-semibold text-white hover:bg-blue-700"
        >
          {copied === "ok"
            ? "Copied! ✅"
            : copied === "fail"
              ? "Copy failed — select and copy manually."
              : "📋 Copy to clipboard"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks / builds**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors. (`TrackReport` and `formatShort` are already exported from `teacher-data.ts`; `noteKey`/`composeTeacherEmail` were added in Task 1.)

- [ ] **Step 3: Commit**

```bash
git add src/app/teacher/TeacherEmailBuilder.tsx
git commit -m "feat: add TeacherEmailBuilder client component

Holds per-note selection state and renders the report list with
checkboxes plus a live draft preview and copy-to-clipboard button,
recomposing via composeTeacherEmail on each toggle."
```

---

## Task 3: Wire `TeacherEmailBuilder` into the teacher page

**Files:**
- Modify: `src/app/teacher/page.tsx`

- [ ] **Step 1: Fetch the teacher name and render the client component**

Add `getTeacher` to the import from `../actions` (line 1–8 block) so it reads:

```ts
import {
  getSchedule,
  getPlans,
  getTracks,
  getDoneTasks,
  getNotesInRange,
  getPrimaryStudent,
  getTeacher,
} from "../actions";
```

Add `TeacherEmailBuilder` to the imports and drop `formatShort` (no longer used in this file — `formatLong` stays for the heading):

```ts
import {
  computeTeacherWindow,
  datesInRange,
  aggregateTeacherReport,
  formatLong,
} from "../teacher-data";
import TeacherEmailBuilder from "./TeacherEmailBuilder";
```

Fetch the teacher alongside the existing parallel fetch — change lines 21–25 to:

```ts
  const [schedule, plans, tracks, teacher] = await Promise.all([
    getSchedule(),
    getPlans(),
    getTracks(),
    getTeacher(),
  ]);
```

Replace the inline `<ul>…</ul>` report list (current lines 60–94) with the client component:

```tsx
      <TeacherEmailBuilder
        report={report}
        studentName={primary.name}
        teacherName={teacher.name}
      />
```

The surrounding `<div>`, `<h1>` heading, and the `window.bounded` notice are unchanged.

- [ ] **Step 2: Verify it builds**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — no type errors; full test suite green.

- [ ] **Step 3: Run the app and verify the feature manually**

Run: `npm run dev`, open `/teacher`. Confirm:
- All note checkboxes start unchecked; the draft shows greeting + hint + sign-off.
- Checking a note adds its track block (name, progress line, that note) to the draft live; unchecking removes it; a track with no checked notes does not appear.
- The Copy button copies the draft and flips to "Copied! ✅".

- [ ] **Step 4: Commit**

```bash
git add src/app/teacher/page.tsx
git commit -m "feat: render TeacherEmailBuilder on the teacher page

page.tsx now fetches the teacher name and delegates the report list to
the interactive TeacherEmailBuilder; data fetching and aggregation are
unchanged."
```

---

## Self-Review notes

- **Spec coverage:** `composeTeacherEmail` pure formatter + `noteKey` (Task 1); greeting/per-track-block/progress-line/note-line/sign-off output and all three edge cases covered by tests (Task 1); checkboxes all-off-by-default, `Set<string>` state, live recompute, read-only textarea, copy button with transient confirmation and failure fallback (Task 2); `page.tsx` shrinks to fetch+aggregate→render client component (Task 3). AI summary, sending/`mailto`, and storing a teacher email are out of scope and not included.
- **Clipboard fallback:** the spec also mentions selecting the textarea text on failure; the component surfaces the "Copy failed — select and copy manually." message and the textarea remains selectable, which satisfies the manual-copy fallback without extra ref plumbing.
- **Type consistency:** `noteKey`, `composeTeacherEmail`, `ComposeInput`, `TrackReport`, `formatShort` names are used identically across tasks; `composeTeacherEmail` takes `{ report, selectedKeys, studentName, teacherName }` everywhere.
