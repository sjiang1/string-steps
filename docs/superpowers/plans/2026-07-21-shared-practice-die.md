# Shared practice-page die with per-item face customization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline execution). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared die on the practice page, summoned by any practice item that uses it. The teacher assigns a meaning to each of the die's 6 faces per item — a **track** from the item's pool or a **rhythm** — and the roll decides what Xiami practices. Replaces the per-item `DiceRoller` and the overloaded `dice: boolean` flag.

**Decisions (from issue #5 discussion, 2026-07-21):**
- **Real d6:** every die-enabled item configures exactly 6 faces. Repeats are allowed (weighting: 2 tracks can get 3 faces each).
- **Free re-roll:** tap to roll any number of times; the last result persists per item (localStorage), matching today's DiceRoller feel.
- Legacy `dice: true` is normalized at read time (same pattern as #4's `normalizePlans`) — no manual Redis migration.

**Architecture:** `PracticeItem.faces?: DieFace[]` replaces `dice: boolean`. Rhythms in `data/dice-rhythms.json` gain stable `id`s so faces can reference them declaratively. A single `PracticeDie` client component lives at the practice-page level; `PracticeTasksList` tracks which item summoned it and each item's last-rolled face. The `primaryTrackId(item)` seam gains a companion `rolledTrackId(item, face)` used by the practice page to render the rolled track (audio, tap-keys, notes all follow the rolled `trackId` automatically). `PlanEditor` gets the multi-track pool UI (deferred from #4) plus a 6-slot face editor.

Issue [#5](https://github.com/sjiang1/string-steps/issues/5) · Depends on #4/#6 (merged)

---

## Data model

```ts
export type DieFace =
  | { kind: "track"; trackId: string }    // trackId must be in item.trackChoices
  | { kind: "rhythm"; rhythmId: string }; // rhythmId must exist in dice-rhythms.json

export type PracticeItem = {
  trackChoices: string[];
  tasks: PlanTask[];
  faces?: DieFace[];   // absent = no die; present = exactly 6 entries (face N = index N-1)
  teacherNote?: string;
};
```

Legacy normalization (read-time, in `actions.ts`): `dice: true` → `faces` = the 6 rhythms in face order; `dice: false`/absent → no `faces`. Already-migrated items pass through untouched.

## File Structure

- **`data/dice-rhythms.json`** (modify) — add `id` per entry (`"pepperoni"`, `"ice-cream"`, `"pineapple"`, `"pony"`, `"double-pepperoni"`, `"may-song"`).
- **`src/app/plans.ts`** (modify) — `DieFace` type; `faces` on `PracticeItem` (drop `dice`); `rolledTrackId(item, face)` helper beside `primaryTrackId`.
- **`src/app/actions.ts`** (modify) — extend `normalizePlans` with the `dice` → `faces` upgrade.
- **`src/app/plans/plan-validation.ts`** (modify) — face rules: exactly 6 when present, track faces ∈ `trackChoices`, rhythm ids exist, pool has no duplicate tracks.
- **`src/app/PracticeDie.tsx`** (create) — the one shared die: overlay summoned by an item, reuses the pip/color art from `DiceRoller`, roll animation, per-item last-face persistence (`dieFace:<itemKey>` in localStorage, itemKey = `trackChoices[0]`), reports the settled face to the page.
- **`src/app/DiceRoller.tsx`** (delete) — retired; art constants move to `PracticeDie`.
- **`src/app/PracticeTasksList.tsx`** (modify) — per-item 🎲 button for `faces` items; holds `activeDieItem` + rolled-face state; renders track faces via `rolledTrackId` (falling back to `primaryTrackId` before first roll) and rhythm faces as the emoji+label chip.
- **`src/app/plans/PracticeItemRow.tsx`** (modify) — pool UI (track chips with remove ×, "+ add track" via picker) replacing the single Change button; face editor (Use-die toggle → 6 selects over pool tracks + rhythms) replacing the Dice checkbox.
- **`src/app/plans/PlanEditor.tsx`** (modify) — picker gains an add-to-pool mode; new-item literal drops `dice`.
- **`src/app/plans/replace-item-track.ts`** (modify) — keep `faces` consistent when a pooled track is replaced/removed.
- **`data/plans.json`, `src/app/test-support/seed.ts`** (modify) — rewrite to `faces` shape.
- **`README.md`** (modify) — update the two dice mentions; link this plan.
- Tests colocated as `*.test.ts` throughout, per existing convention.

---

## Task 1: Rhythm ids

- [ ] Add `id` to each `data/dice-rhythms.json` entry; export a `Rhythm` type + lookup helper (`rhythmById`) from a small `src/app/rhythms.ts`.
- [ ] Unit test: every entry has a unique id and face 1–6 exactly once.

## Task 2: `DieFace` model + legacy normalization (TDD)

- [ ] `plans.ts`: add `DieFace`, swap `dice: boolean` → `faces?: DieFace[]`; add `rolledTrackId(item, face): string | null` (null for rhythm faces) beside `primaryTrackId`.
- [ ] `actions.ts` `normalizePlans`: `dice: true` → 6 rhythm faces; `dice` key stripped either way. Tests: legacy-true upgrades, legacy-false drops cleanly, migrated item untouched.
- [ ] Rewrite `data/plans.json` + `test-support/seed.ts`; fix compile errors across the suite mechanically (`dice: false` → no `faces`).

## Task 3: Validation (TDD)

- [ ] `plan-validation.ts`: when `faces` present — length must be 6; every track face's `trackId` ∈ `trackChoices`; every `rhythmId` known; `trackChoices` has no duplicates. Editor error strings added to `PlanEditor`'s error summary.

## Task 4: Shared `PracticeDie` component

- [ ] Create `PracticeDie.tsx`: fixed-position overlay (child-friendly: big die, tap anywhere on it to roll, ✕ to put away), pip art + colors carried over from `DiceRoller`, 26-tick roll animation, settled face → `onSettle(face)` + localStorage persistence per item key.
- [ ] Delete `DiceRoller.tsx`.

## Task 5: Practice page wiring

- [ ] `PracticeTasksList`: 🎲 "Roll for it!" button on `faces` items summons the die for that item; rolled face state initialized from localStorage; track-face result switches the rendered track (name, audio/video, tap-keys, note — all already keyed by `trackId`); rhythm-face result shows the rhythm chip next to the button.
- [ ] Component test: rolling a track face re-renders the item under the rolled track's id.

## Task 6: Editor — track pool UI

- [ ] `PracticeItemRow`: render `trackChoices` as chips (first = primary); × removes (min 1); "+ add track" opens `TrackPicker` in add-to-pool mode (excludes tracks already in the pool). `PlanEditor` picker state gains `{ mode: "add-to-pool"; index }`.
- [ ] `replace-item-track.ts`: removing/replacing a pooled track rewrites matching track faces (point them at the pool's first track). Tests.

## Task 7: Editor — face configuration UI

- [ ] `PracticeItemRow`: "🎲 Use die" toggle. On enable, default faces = pool tracks cycled across the 6 slots (single-track pool defaults to the 6 legacy rhythms). Each slot: a select listing pool tracks + rhythms. On disable, `faces` removed.

## Task 8: Docs + finish line

- [ ] README: update the dice-roller mentions (lines ~23, 27, 66) to describe the shared die; link this plan per docs convention.
- [ ] Full suite + typecheck + lint green.
