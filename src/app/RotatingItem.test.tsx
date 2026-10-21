// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { PracticeItem, Track } from "./plans";
import type { Student } from "./students";
import RotatingItem from "./RotatingItem";

vi.mock("./TaskList", () => ({
  default: ({ trackId }: { trackId: string }) => <div data-testid="task-list">{trackId}</div>,
}));
vi.mock("./TrackNote", () => ({ default: () => null }));

const TRACKS: Track[] = ["p1", "p2", "p3", "p4"].map((id) => ({
  id,
  name: `Piece ${id.slice(1)}`,
  type: "reference" as const,
  file: null,
}));
const ITEM: PracticeItem = {
  trackChoices: ["p1", "p2", "p3", "p4"],
  tasks: [{ type: "sing", count: 1 }],
  dice: false,
  perDay: 2,
};
const PRIMARY: Student = { id: "k", name: "K", emoji: "🎻", kind: "primary" };

function renderItem(doneTasks: string[] = []) {
  render(
    <RotatingItem
      item={ITEM}
      tracks={TRACKS}
      taskTypes={[]}
      doneTasks={doneTasks}
      notesByTrack={{}}
      activeStudent={PRIMARY}
      view={{
        suggested: ["p3", "p4"],
        lastDoneLabel: { p1: "✓ yesterday", p2: "✓ yesterday", p3: "not yet", p4: "not yet" },
      }}
    />,
  );
}

afterEach(cleanup);

describe("RotatingItem", () => {
  it("lists suggested tracks first, starred and open; others collapsed", () => {
    renderItem();
    const rows = screen.getAllByRole("button", { name: /Piece/ });
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("⭐"),
      expect.stringContaining("⭐"),
      expect.not.stringContaining("⭐"),
      expect.not.stringContaining("⭐"),
    ]);
    expect(rows[0].textContent).toContain("Piece 3");
    expect(screen.getAllByTestId("task-list").map((e) => e.textContent)).toEqual(["p3", "p4"]);
  });

  it("opens a collapsed track on tap", () => {
    renderItem();
    fireEvent.click(screen.getByRole("button", { name: /Piece 1/ }));
    expect(screen.getAllByTestId("task-list").map((e) => e.textContent)).toContain("p1");
  });

  it("titles an unnamed item by its rotation and counts tracks done today", () => {
    renderItem(["p1-sing-0"]);
    const header = screen.getByRole("heading");
    expect(header.textContent).toBe("🔁 2 of 4 tracks");
    expect(screen.getByText("1/2 tracks done today")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /Piece 1/ })).getByText("✓ yesterday")).toBeTruthy();
  });
});
