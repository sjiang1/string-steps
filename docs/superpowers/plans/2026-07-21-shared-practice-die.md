# Shared practice-page die with per-item face customization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline execution). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared die on the practice page, summoned by any practice item that uses it. The die is a **plain numeric d6** — no per-face meaning is stored. Each die-enabled item keeps an **ordered list of choices** (tracks from its pool and/or rhythms); the rolled number indexes the list (face 1 = first choice). Replaces the per-item `DiceRoller`. `dice: boolean` **stays** as the item's die-enabled status — and is the future hook for auto-summoning the die when the page loads.

**Decisions (from issue #5 discussion, 2026-07-21):**
- **Plain d6, list-indexed:** the die always shows 1–6 pips. An item's choice list has 1–6 entries; rolling a number beyond the list length means "roll again!" (real-die feel, no config needed).
- **Free re-roll:** tap to roll any number of times; the last result persists per item (localStorage), matching today's DiceRoller feel.
- **`dice: boolean` is kept**, not retired: it stays the per-item die-enabled status (and later enables auto-popping the die module for `dice: true` items — out of scope here, noted as the follow-up hook).
- Legacy `dice: true` items (no `dieChoices` yet) are normalized at read time (same pattern as #4's `normalizePlans`) — no manual Redis migration.

**Architecture:** `PracticeItem` keeps `dice: boolean` as the enable flag and gains `dieChoices?: DieChoice[]` as its configuration — an ordered list, position = face number. Rhythms in `data/dice-rhythms.json` gain stable `id`s so choices can reference them declaratively. A single `PracticeDie` client component lives at the practice-page level; `PracticeTasksList` tracks which item summoned it and each item's last-rolled face. The `primaryTrackId(item)` seam gains a companion `rolledTrackId(item, face)` used by the practice page to render the rolled track (audio, tap-keys, notes all follow the rolled `trackId` automatically). `PlanEditor` gets the multi-track pool UI (deferred from #4) plus a simple ordered-list choice editor.

Issue [#5](https://github.com/sjiang1/string-steps/issues/5) · Depends on #4/#6 (merged)

---

## Data model

```ts
export type DieChoice =
  | { kind: "track"; trackId: string }    // trackId must be in item.trackChoices
  | { kind: "rhythm"; rhythmId: string }; // rhythmId must exist in dice-rhythms.json

export type PracticeItem = {
  trackChoices: string[];
  tasks: PlanTask[];
  dice: boolean;            // die-enabled status (future: auto-summon the die when true)
  dieChoices?: DieChoice[]; // required 1–6 entries when dice is true; face N = index N-1
  teacherNote?: string;
};
```

Rolling face N with `N > dieChoices.length` is a miss — the die says "roll again!". No per-face mapping is stored; the list order IS the mapping.

Legacy normalization (read-time, in `actions.ts`): `dice: true` without `dieChoices` → `dieChoices` = the 6 rhythms in face order (today's rhythm die, unchanged behavior); `dice: false` → any stray `dieChoices` stripped. Already-migrated items pass through untouched.

## File Structure

- **`data/dice-rhythms.json`** (modify) — add `id` per entry (`"pepperoni"`, `"ice-cream"`, `"pineapple"`, `"pony"`, `"double-pepperoni"`, `"may-song"`).
- **`src/app/plans.ts`** (modify) — `DieChoice` type; `dieChoices` added to `PracticeItem` (`dice` kept as the enable flag); `rolledTrackId(item, face)` helper beside `primaryTrackId`.
- **`src/app/actions.ts`** (modify) — extend `normalizePlans` with the `dice` → `dieChoices` upgrade.
- **`src/app/plans/plan-validation.ts`** (modify) — die rules: 1–6 entries when present, track choices ∈ `trackChoices`, rhythm ids exist, pool has no duplicate tracks.
- **`src/app/PracticeDie.tsx`** (create) — the one shared die: overlay summoned by an item, reuses the pip/color art from `DiceRoller`, roll animation, "roll again!" state for misses, per-item last-face persistence (`dieFace:<itemKey>` in localStorage, itemKey = `trackChoices[0]`), reports the settled face to the page.
- **`src/app/DiceRoller.tsx`** (delete) — retired; art constants move to `PracticeDie`.
- **`src/app/PracticeTasksList.tsx`** (modify) — per-item 🎲 button for `dice: true` items; holds `activeDieItem` + rolled-face state; a rolled track choice renders via `rolledTrackId` (falling back to `primaryTrackId` before first roll), a rolled rhythm shows the emoji+label chip.
- **`src/app/plans/PracticeItemRow.tsx`** (modify) — pool UI (track chips with remove ×, "+ add track" via picker) replacing the single Change button; die editor (the existing Dice checkbox becomes the `dice` toggle, now revealing the ordered, numbered choice list built from pool tracks + rhythms).
- **`src/app/plans/PlanEditor.tsx`** (modify) — picker gains an add-to-pool mode.
- **`src/app/plans/replace-item-track.ts`** (modify) — keep `dieChoices` consistent when a pooled track is replaced/removed.
- **`data/plans.json`, `src/app/test-support/seed.ts`** (modify) — rewrite to `dieChoices` shape.
- **`README.md`** (modify) — update the two dice mentions; link this plan.
- Tests colocated as `*.test.ts` throughout, per existing convention.

---

## Task 1: Rhythm ids

- [x] Add `id` to each `data/dice-rhythms.json` entry; export a `Rhythm` type + lookup helper (`rhythmById`) from a small `src/app/rhythms.ts`.
- [x] Unit test: every entry has a unique id and face 1–6 exactly once.

## Task 2: `DieChoice` model + legacy normalization (TDD)

- [x] `plans.ts`: add `DieChoice` and `dieChoices?: DieChoice[]` (keeping `dice: boolean`); add `rolledTrackId(item, face): string | null` (null for rhythm choices and face misses) beside `primaryTrackId`.
- [x] `actions.ts` `normalizePlans`: `dice: true` without `dieChoices` → the 6 rhythms as choices; `dice: false` → strip stray `dieChoices`. Tests: legacy-true upgrades, dice-false untouched, migrated item untouched.
- [x] Update `data/plans.json` + `test-support/seed.ts` where die items exist; existing `dice: false` literals stay valid as-is.

## Task 3: Validation (TDD)

- [x] `plan-validation.ts`: when `dice` is true — `dieChoices` required, 1–6 entries; every track choice's `trackId` ∈ `trackChoices`; every `rhythmId` known; `trackChoices` has no duplicates. Editor error strings added to `PlanEditor`'s error summary.

## Task 4: Shared `PracticeDie` component

- [x] Create `PracticeDie.tsx`: fixed-position overlay (child-friendly: big die, tap anywhere on it to roll, ✕ to put away), pip art + colors carried over from `DiceRoller`, 26-tick roll animation, "roll again!" prompt when the face exceeds the item's list, settled face → `onSettle(face)` + localStorage persistence per item key.
- [x] Delete `DiceRoller.tsx`.

## Task 5: Practice page wiring

- [x] `PracticeTasksList`: 🎲 "Roll for it!" button on `dice: true` items summons the die for that item (auto-summon on page load is the noted follow-up, not built here); rolled face state initialized from localStorage; a rolled track choice switches the rendered track (name, audio/video, tap-keys, note — all already keyed by `trackId`); a rolled rhythm shows the rhythm chip next to the button.
- [x] Component test: rolling a track choice re-renders the item under the rolled track's id.

## Task 6: Editor — track pool UI

- [x] `PracticeItemRow`: render `trackChoices` as chips (first = primary); × removes (min 1); "+ add track" opens `TrackPicker` in add-to-pool mode (excludes tracks already in the pool). `PlanEditor` picker state gains `{ mode: "add-to-pool"; index }`.
- [x] `replace-item-track.ts`: removing/replacing a pooled track rewrites matching die choices (replaced → new track; removed → choice dropped). Tests.

## Task 7: Editor — die choice list UI

- [x] `PracticeItemRow`: the Dice checkbox stays the `dice` toggle. On enable, default `dieChoices` = the pool's tracks in order (single-track pool defaults to the 6 legacy rhythms). The list renders numbered 1–6 with remove ×; "+ add" offers pool tracks and rhythms; cap at 6. On disable, `dice: false` and `dieChoices` removed.

## Task 8: Docs + finish line

- [x] README: update the dice-roller mentions (lines ~23, 27, 66) to describe the shared die; link this plan per docs convention.
- [x] Full suite + typecheck + lint green.
