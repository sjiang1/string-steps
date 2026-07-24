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

    fireEvent.click(screen.getByLabelText("Pick up the die"));
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

  it("shows no floating die or watermark when no item has dice", () => {
    renderList([{ trackChoices: ["a"], tasks: [], dice: false }]);
    expect(screen.queryByLabelText("Pick up the die")).toBeNull();
    expect(screen.queryByLabelText(/Roll the die/)).toBeNull();
  });
});
