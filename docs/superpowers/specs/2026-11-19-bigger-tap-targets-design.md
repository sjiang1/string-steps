# Bigger tap targets on the Practice tab (#50)

**Issue:** https://github.com/sjiang1/string-steps/issues/50

## Intent

On the iPad, lying on a table and tapped from arm's length (sometimes with a violin on the shoulder, by the bow or violin hand), the task buttons and the track's play button are both too small and only 8 px apart. Taps meant for one land on the other, in both directions. Siyuan and Xiami both hit this daily.

## Goals

- Play and the task buttons are each a comfortable target (≥ 44 px, aiming larger) with clear space between them.
- A miss near Play lands on nothing or on Play, never on a task; and the other way round.
- Text in the practice card is one step larger, since it reads small at that distance.

## Non-goals

- A fully custom player with our own progress bar and time display (option 3 below). Can be built later on the same audio element.
- The broader child-friendly redesign, which stays a separate future overhaul.
- Any change to what the task buttons do, to playback speed, or to the data.

## Anti-goal

Slower first play. Media keeps preloading exactly as today (see #49, declined).

## Approaches considered

1. **Spacing only** – gap between tasks and player, bigger task buttons, native player untouched. Fixes task→play misses, leaves Safari's ~30 px play button as the target for the other direction. Rejected: half the problem.
2. **Big custom Play/Pause button, native bar kept below for scrubbing** – chosen. Fixes both directions, keeps seeking/duration/volume for free, same audio element so the speed logic is untouched. Slightly mismatched look (our button above Safari's grey bar).
3. **Fully custom player** – the industry end state, about a day's work; the touch-draggable progress bar is its own tap-target problem. Deferred.

## Design

**`src/app/TrackMedia.tsx` (audio only).** Above the existing `<audio controls>` element, render a full-width button, ~64 px tall, large text, showing `▶ Play` or `⏸ Pause`. Tapping it calls `play()` / `pause()` on the same element. The label follows the element's `play`, `pause` and `ended` events, so using the native bar underneath keeps the big button in step. The `playbackRate` handling is unchanged. Video tracks are unchanged: on the iPad the picture itself is the large play target.

**`src/app/TaskList.tsx`.** Task buttons grow to ~56 px tall (`min-h-14`, `px-5 py-3`, `text-lg`), gaps widen to 12 px, and the list gets ~20 px of space below it before the media. Behaviour unchanged.

**Card text.** Item title and rotating-item track names go up one step (`text-lg`). Nothing else on the page changes size.

**Both layouts.** `PracticeTasksList.tsx` and `RotatingItem.tsx` share these components, so both get the fix with no per-page change beyond the title size.

## Layout after the change

```
┌──────────────────────────────────────────────┐
│ Twinkle Variation A      🐢 0.8×         🎲   │
│ 👨‍🏫 Keep the bow straight                     │
│ [ 🎤 Sing 0/1 ]   [ 🎵 Play with track 1/3 ]   │  ← ~56 px tall, text-lg, 12 px gaps
│                                              │  ← ~20 px
│ ┌──────────────────────────────────────────┐ │
│ │              ▶  Play                     │ │  ← ~64 px tall, full width
│ └──────────────────────────────────────────┘ │
│ 0:00 ─────────────────────── 2:31   🔊       │  ← native bar, scrubbing only
│ + note                                       │
└──────────────────────────────────────────────┘
```

## Testing

- Unit: the big button calls `play()` on tap and `pause()` on the next tap; its label follows the element's `play`/`pause`/`ended` events (jsdom does not implement `play()`, so the test stubs it on the element). Existing `TaskList`/`PracticeTasksList`/`RotatingItem` tests keep passing.
- Size/class changes get no unit tests (agreed convention for visual lookups).
- Done when Siyuan confirms on the iPad: first tap on the big button starts playback, and a session's worth of taps produces no cross-hits.

## Left to the builder

Exact Tailwind classes within the sizes above; whether the big button uses the emerald/zinc palette already on the page (it should match the existing task-button style).
