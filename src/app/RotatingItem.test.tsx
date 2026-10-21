// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { PracticeItem, Track } from "./plans";
import type { Student } from "./students";

// Task lists in rows that are open (collapsed rows keep theirs mounted but hidden).
function visibleTaskLists(): string[] {
  return screen
    .getAllByTestId("task-list")
    .filter((e) => !e.closest("[hidden]"))
    .map((e) => e.textContent ?? "");
}
import RotatingItem from "./RotatingItem";

vi.mock("./TaskList", () => ({
  default: ({ trackId }: { trackId: string }) => <div data-testid="task-list">{trackId}</div>,
}));
// A stateful stand-in: a saved note lives only in TrackNote's own state.
vi.mock("./TrackNote", async () => {
  const { useState } = await import("react");
  return {
    default: function TrackNote({ trackId }: { trackId: string }) {
      const [note, setNote] = useState("");
      return <button onClick={() => setNote("saved")}>{`note ${trackId}: ${note || "none"}`}</button>;
    },
  };
});

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
    expect(visibleTaskLists()).toEqual(["p3", "p4"]);
  });

  it("opens a collapsed track on tap", () => {
    renderItem();
    fireEvent.click(screen.getByRole("button", { name: /Piece 1/ }));
    expect(visibleTaskLists()).toContain("p1");
  });

  it("keeps a note saved in a track after its row is collapsed and reopened", () => {
    renderItem();
    fireEvent.click(screen.getByRole("button", { name: "note p3: none" }));
    fireEvent.click(screen.getByRole("button", { name: /Piece 3/ }));
    fireEvent.click(screen.getByRole("button", { name: /Piece 3/ }));
    expect(screen.getByRole("button", { name: "note p3: saved" })).toBeTruthy();
  });

  it("titles an unnamed item by its rotation and counts tracks done today", () => {
    renderItem(["p1-sing-0"]);
    const header = screen.getByRole("heading");
    expect(header.textContent).toBe("🔁 2 of 4 tracks");
    expect(screen.getByText("1/2 tracks done today")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /Piece 1/ })).getByText("✓ yesterday")).toBeTruthy();
  });
});

describe("RotatingItem per-track speed", () => {
  it("plays each audio track at its own speed and badges slow ones", () => {
    const songs: Track[] = TRACKS.map((t) => ({ ...t, type: "audio" as const, file: `/${t.id}.mp3` }));
    const item: PracticeItem = {
      ...ITEM,
      tasks: [{ type: "playWithTrack", count: 1 }],
      trackSpeeds: { p3: 0.75 },
    };
    const { container } = render(
      <RotatingItem
        item={item}
        tracks={songs}
        taskTypes={[]}
        doneTasks={[]}
        notesByTrack={{}}
        activeStudent={PRIMARY}
        view={{ suggested: ["p3", "p4"], lastDoneLabel: {} }}
      />,
    );
    const rates = Array.from(container.querySelectorAll("audio")).map((a) => [a.getAttribute("src"), a.playbackRate]);
    expect(rates).toContainEqual(["/p3.mp3", 0.75]);
    expect(rates).toContainEqual(["/p4.mp3", 1]);
    expect(within(screen.getByRole("button", { name: /Piece 3/ })).getByText("🐢 0.75×")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /Piece 4/ })).queryByText(/🐢/)).toBeNull();
  });
});
