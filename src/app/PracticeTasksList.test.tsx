// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { PracticeItem, Track } from "./plans";
import type { Student } from "./students";
import PracticeTasksList from "./PracticeTasksList";

// TaskList pulls in server actions (fs, Redis) and canvas-confetti; the die
// wiring under test only needs to see which trackId the item renders under.
vi.mock("./TaskList", () => ({
  default: ({ trackId }: { trackId: string }) => (
    <div data-testid="task-list">{trackId}</div>
  ),
}));
vi.mock("./TrackNote", () => ({ default: () => null }));

const TRACKS: Track[] = [
  { id: "a", name: "Track A", type: "reference", file: null },
  { id: "b", name: "Track B", type: "reference", file: null },
];

const DIE_ITEM: PracticeItem = {
  trackChoices: ["a", "b"],
  tasks: [],
  dice: true,
  dieChoices: [
    { kind: "track", trackId: "a" },
    { kind: "track", trackId: "b" },
  ],
};

const NAMED_ITEM: PracticeItem = { ...DIE_ITEM, name: "Twinkle Twinkle" };

const LINKED: Student = { id: "s", name: "S", emoji: "🐨", kind: "linked" };

function renderList(items: PracticeItem[]) {
  return render(
    <PracticeTasksList
      items={items}
      tracks={TRACKS}
      taskTypes={[]}
      doneTasks={[]}
      notesByTrack={{}}
      activeStudent={LINKED}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PracticeTasksList die wiring", () => {
  it("rolling a track choice re-renders the item under the rolled track's id", () => {
    // floor(0.2 * 6) + 1 = face 2 → second choice → track b.
    vi.spyOn(Math, "random").mockReturnValue(0.2);
    renderList([DIE_ITEM]);

    expect(screen.getByText("Track A")).toBeTruthy();
    expect(screen.getByTestId("task-list").textContent).toBe("a");

    fireEvent.click(screen.getByLabelText("Roll the die for Track A"));
    expect(screen.getByText("Rolling for Track A!")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/tap to roll/));
    act(() => {
      vi.advanceTimersByTime(26 * 90);
    });

    expect(screen.getByText("Track B")).toBeTruthy();
    expect(screen.getByTestId("task-list").textContent).toBe("b");
    expect(localStorage.getItem("dieFace:a")).toBe("2");
  });

  it("summons the die for a specific item from its card watermark", () => {
    renderList([DIE_ITEM]);
    fireEvent.click(screen.getByLabelText("Roll the die for Track A"));
    expect(screen.getByText("Rolling for Track A!")).toBeTruthy();
  });

  it("restores the last rolled face from localStorage on load", () => {
    localStorage.setItem("dieFace:a", "2");
    renderList([DIE_ITEM]);
    act(() => {});
    expect(screen.getByText("Track B")).toBeTruthy();
  });

  it("shows no die watermark when no item has dice", () => {
    renderList([{ trackChoices: ["a"], tasks: [], dice: false }]);
    expect(screen.queryByLabelText(/Roll the die/)).toBeNull();
  });
});

describe("PracticeTasksList item names", () => {
  it("titles an unnamed item with its resolved track's name", () => {
    renderList([DIE_ITEM]);
    expect(screen.getByRole("heading", { name: "Track A" })).toBeTruthy();
    expect(screen.queryByText(/Playing/)).toBeNull();
  });

  it("titles a named item with its own name and shows the track as secondary text", () => {
    renderList([NAMED_ITEM]);
    expect(screen.getByRole("heading", { name: "Twinkle Twinkle" })).toBeTruthy();
    expect(screen.getByText("♪ Track A")).toBeTruthy();
  });

  it("keeps the item name as title after a roll and updates the secondary track", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.2);
    renderList([NAMED_ITEM]);
    fireEvent.click(screen.getByLabelText("Roll the die for Twinkle Twinkle"));
    expect(screen.getByText("Rolling for Twinkle Twinkle!")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/tap to roll/));
    act(() => {
      vi.advanceTimersByTime(26 * 90);
    });
    expect(screen.getByRole("heading", { name: "Twinkle Twinkle" })).toBeTruthy();
    expect(screen.getByText("♪ Track B")).toBeTruthy();
  });

  it("treats a whitespace-only name as unnamed (hand-edited plan data)", () => {
    renderList([{ ...DIE_ITEM, name: "   " }]);
    expect(screen.getByRole("heading", { name: "Track A" })).toBeTruthy();
    expect(screen.queryByText("♪ Track A")).toBeNull();
  });

  it("omits the secondary track line when it would repeat the item name", () => {
    renderList([{ ...DIE_ITEM, name: "Track A" }]);
    expect(screen.queryByText("♪ Track A")).toBeNull();
  });
});

describe("PracticeTasksList playback speed", () => {
  const SONG: Track = { id: "song", name: "Song", type: "audio", file: "/song.mp3" };
  const SLOW_ITEM: PracticeItem = {
    trackChoices: ["song"],
    tasks: [{ type: "playWithTrack", count: 1 }],
    dice: false,
    speed: 0.75,
  };

  function renderSpeedList(item: PracticeItem) {
    return render(
      <PracticeTasksList
        items={[item]}
        tracks={[SONG]}
        taskTypes={[]}
        doneTasks={[]}
        notesByTrack={{}}
        activeStudent={LINKED}
      />,
    );
  }

  it("plays the audio at the item's speed", () => {
    const { container } = renderSpeedList(SLOW_ITEM);
    expect(container.querySelector("audio")!.playbackRate).toBe(0.75);
  });

  it("keeps the speed after the audio reloads", () => {
    const { container } = renderSpeedList(SLOW_ITEM);
    const audio = container.querySelector("audio")!;
    audio.playbackRate = 1; // what a browser does when the media (re)loads
    fireEvent(audio, new Event("loadedmetadata"));
    expect(audio.playbackRate).toBe(0.75);
  });

  it("shows a slow-speed badge", () => {
    renderSpeedList(SLOW_ITEM);
    expect(screen.getByText("🐢 0.75×")).toBeTruthy();
  });

  it("plays at normal speed with no badge when the item gets no speed choice", () => {
    const { container } = renderSpeedList({ ...SLOW_ITEM, tasks: [{ type: "sing", count: 1 }] });
    expect(container.querySelector("audio")!.playbackRate).toBe(1);
    expect(screen.queryByText(/🐢/)).toBeNull();
  });
});
