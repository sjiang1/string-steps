# Bigger Tap Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Practice tab, make the track's play control and the task buttons large, well-separated targets so taps on the iPad stop landing on the wrong one (#50).

**Architecture:** `TrackMedia` gains a big custom Play/Pause button above the existing native `<audio controls>` element; the button drives that same element and mirrors its play/pause/ended events, so the native bar stays usable for scrubbing and the playback-speed logic is untouched. `TaskList` buttons grow and get a gap before the media; card titles go up one text size. Both practice layouts (`PracticeTasksList`, `RotatingItem`) share these pieces.

**Tech Stack:** Next.js 16 / React client components, Tailwind classes, Vitest 4 + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-19-bigger-tap-targets-design.md`

## Global Constraints

- Media keeps preloading exactly as today: no `preload` attribute is added (spec anti-goal; #49 declined).
- Video tracks keep the native `<video controls>` element and get no custom button.
- The `<audio>` element keeps `controls`, `src`, and the `playbackRate` re-apply on `loadedmetadata`.
- Sizes from the mockup: task buttons `min-h-14 px-5 py-3 text-lg`, gaps `gap-3`, `mb-5` before the media; Play button `min-h-16` full width `text-xl`; titles `text-lg`.
- Size/class-only changes get no unit tests (project convention).

## Review Focus

1. Play pressed on the native bar instead of the big button: the big button must read `⏸ Pause` (Task 1 test "label follows the element's play event").
2. Track plays to the end: the big button must return to `▶ Play` without a tap (Task 1 test "returns to Play on ended").
3. `play()` rejects (Safari refuses or the file fails): no unhandled rejection, label stays `▶ Play` (Task 1 test "a rejected play() is swallowed").
4. A collapsed rotating-item panel: its big button is inside the `hidden` div, so it is not tappable and the existing RotatingItem tests still pass (Task 2 suite run).
5. Reference tracks (no media): `TrackMedia` still renders nothing (Task 1 test "renders nothing for a reference track").

---

### Task 1: Big Play/Pause button in `TrackMedia`

**Files:**
- Modify: `src/app/TrackMedia.tsx`
- Create: `src/app/TrackMedia.test.tsx`

**Interfaces:**
- Consumes: `Track` from `./plans` (`type: "audio" | "video" | "reference"`, `file: string | null`).
- Produces: unchanged default export `TrackMedia({ track, speed })`. New DOM for audio tracks: a `<button type="button">` whose text is `▶ Play` or `⏸ Pause`, rendered before the `<audio>` element.

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import TrackMedia from "./TrackMedia";
import type { Track } from "./plans";

const AUDIO: Track = { id: "a1", name: "Twinkle", type: "audio", file: "/audio/a1.mp3" };
const VIDEO: Track = { id: "v1", name: "Demo", type: "video", file: "/videos/v1.mp4" };
const REF: Track = { id: "r1", name: "A Major Scale", type: "reference", file: null };

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // jsdom does not implement media playback.
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
});
afterEach(cleanup);

const audioEl = () => document.querySelector("audio") as HTMLAudioElement;

describe("TrackMedia audio", () => {
  it("renders a Play button above the native player", () => {
    render(<TrackMedia track={AUDIO} speed={1} />);
    const button = screen.getByRole("button", { name: /play/i });
    expect(button.textContent).toBe("▶ Play");
    expect(audioEl().hasAttribute("controls")).toBe(true);
    expect(audioEl().getAttribute("src")).toBe("/audio/a1.mp3");
    expect(button.compareDocumentPosition(audioEl()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("tapping Play calls play(); tapping Pause calls pause()", () => {
    render(<TrackMedia track={AUDIO} speed={1} />);
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    expect(play).toHaveBeenCalledTimes(1);
    act(() => { fireEvent(audioEl(), new Event("play")); });
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("label follows the element's play event (native bar pressed)", () => {
    render(<TrackMedia track={AUDIO} speed={1} />);
    act(() => { fireEvent(audioEl(), new Event("play")); });
    expect(screen.getByRole("button").textContent).toBe("⏸ Pause");
    act(() => { fireEvent(audioEl(), new Event("pause")); });
    expect(screen.getByRole("button").textContent).toBe("▶ Play");
  });

  it("returns to Play on ended", () => {
    render(<TrackMedia track={AUDIO} speed={1} />);
    act(() => { fireEvent(audioEl(), new Event("play")); });
    act(() => { fireEvent(audioEl(), new Event("ended")); });
    expect(screen.getByRole("button").textContent).toBe("▶ Play");
  });

  it("a rejected play() is swallowed and the label stays Play", async () => {
    play.mockImplementation(() => Promise.reject(new Error("NotAllowedError")));
    render(<TrackMedia track={AUDIO} speed={1} />);
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("button").textContent).toBe("▶ Play");
  });

  it("still applies the speed on loadedmetadata", () => {
    render(<TrackMedia track={AUDIO} speed={0.8} />);
    act(() => { fireEvent(audioEl(), new Event("loadedmetadata")); });
    expect(audioEl().playbackRate).toBe(0.8);
  });
});

describe("TrackMedia other types", () => {
  it("video keeps the native element and gets no button", () => {
    render(<TrackMedia track={VIDEO} speed={1} />);
    expect(document.querySelector("video")?.hasAttribute("controls")).toBe(true);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing for a reference track", () => {
    const { container } = render(<TrackMedia track={REF} speed={1} />);
    expect(container.innerHTML).toBe("");
  });
});
```


- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/TrackMedia.test.tsx`
Expected: the five audio-button tests FAIL (no button found); "still applies the speed", "video", and "reference" PASS already.

- [ ] **Step 3: Implement the button in `src/app/TrackMedia.tsx`**

Inside `SpeedAudio`: a `useRef<HTMLAudioElement>(null)` (merge with the existing `apply` ref callback), a `useState<boolean>(false)` `playing`, and handlers `onPlay={() => setPlaying(true)}`, `onPause={() => setPlaying(false)}`, `onEnded={() => setPlaying(false)}` on the `<audio>`. Render before the `<audio>`:

```tsx
<button
  type="button"
  onClick={() => {
    const el = ref.current;
    if (!el) return;
    if (playing) el.pause();
    else el.play().catch(() => {});
  }}
  className={`mb-2 flex min-h-16 w-full items-center justify-center gap-3 rounded-xl text-xl font-semibold ${
    playing ? "bg-zinc-200 text-zinc-900" : "bg-emerald-600 text-white"
  }`}
>
  {playing ? "⏸ Pause" : "▶ Play"}
</button>
```

The `<audio>` keeps `controls`, `className="w-full mb-2"`, `src`, and `onLoadedMetadata`. Wrap both in a fragment. Update the file's top comment to say the big button exists for tap size on the iPad (#50) and mirrors the element's events.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/TrackMedia.test.tsx`
Expected: 8 passed.

- [ ] **Step 5: Run the whole suite, lint and types**

Run: `npm test 2>&1 | tail -5 && npx tsc --noEmit && npx eslint src/app/TrackMedia.tsx src/app/TrackMedia.test.tsx`
Expected: all tests pass, no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/TrackMedia.tsx src/app/TrackMedia.test.tsx
git commit -m "feat: big Play/Pause button above the native audio bar (#50)

TrackMedia renders a 64 px full-width button that drives the same audio
element the native controls use; its label follows the element's play,
pause and ended events so either control keeps the other honest. Video
and reference tracks are unchanged."
```

---

### Task 2: Larger task buttons, gap before the media, larger titles

**Files:**
- Modify: `src/app/TaskList.tsx:88-112` (the `<ul>` and `<button>` classes)
- Modify: `src/app/PracticeTasksList.tsx:89` (`<h3>`)
- Modify: `src/app/RotatingItem.tsx:49` (`<h3>`) and `:72` (track-name `<span>`)
- Modify: `README.md` (Practice Tracks section)

**Interfaces:**
- Consumes: nothing from Task 1 (independent; both tasks touch different files).
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Change the classes**

- `TaskList.tsx` `<ul>`: `flex flex-wrap gap-2 mb-2` → `flex flex-wrap gap-3 mb-5`.
- `TaskList.tsx` `<button>`: `rounded-xl px-4 py-2 text-base font-medium …` → `min-h-14 rounded-xl px-5 py-3 text-lg font-medium …` (keep the rest of the template string as is).
- `PracticeTasksList.tsx` `<h3 className="font-semibold">` → `<h3 className="text-lg font-semibold">`.
- `RotatingItem.tsx` `<h3 className="font-semibold">` → `text-lg font-semibold`; the track-name `<span className="font-medium">` → `text-lg font-medium`.

- [ ] **Step 2: Add one README sentence**

At the end of the "Practice Tracks" section's last paragraph in `README.md`, add: `On the iPad the task buttons and a large Play button are sized for tapping from arm's length; see the [tap-target design](docs/superpowers/specs/2026-11-19-bigger-tap-targets-design.md).`

- [ ] **Step 3: Run the suite, lint and types**

Run: `npm test 2>&1 | tail -5 && npx tsc --noEmit && npx eslint src/app/TaskList.tsx src/app/PracticeTasksList.tsx src/app/RotatingItem.tsx`
Expected: all tests pass (the class changes are not asserted on anywhere), no type or lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/TaskList.tsx src/app/PracticeTasksList.tsx src/app/RotatingItem.tsx README.md
git commit -m "feat: larger task buttons, titles and a gap before the player (#50)

TaskList buttons grow to 56 px with 12 px gaps and 20 px of space before
TrackMedia; the practice-card titles in PracticeTasksList and RotatingItem
go up one text size. README links the tap-target design."
```

---

### Task 3: Manual check on a preview deployment

No code. After the PR is open and Vercel has built the preview:

- [ ] **Step 1:** Log in to the preview on the iPad, open the Practice tab, and for one audio track: tap the big button (playback must start on the first tap), tap it again (pauses), press play on the native bar (big button reads Pause), let a short track finish (big button reads Play).
- [ ] **Step 2:** Run through a practice session's worth of task taps and play taps with the iPad on the table. Expected: no cross-hits.
- [ ] **Step 3:** Check a rotating item: collapsed rows show no Play button; an expanded row shows one.

Done when Siyuan reports the above on the PR.
