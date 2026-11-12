// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { Plan, PracticeItem, Track } from "../../plans";
import PrintablePlan from "./PrintablePlan";

const TRACKS: Track[] = [
  { id: "twinkle-a", name: "Twinkle A", type: "audio", file: "a.mp3" },
  { id: "twinkle-b", name: "Twinkle B", type: "audio", file: "b.mp3" },
  { id: "twinkle-c", name: "Twinkle C", type: "audio", file: "c.mp3" },
  { id: "scale", name: "A Major Scale", type: "reference", file: null },
  { id: "demo", name: "Third finger demo", type: "video", file: "demo.mp4" },
];

const CHECKLIST = [
  { id: "mouse-holes", emoji: "🐭", description: "Three mouse holes on the bow hand" },
  { id: "baby-bear", emoji: "🐻", description: "Baby bear gesture on the violin hand" },
];

function plan(items: PracticeItem[], extra: Partial<Plan> = {}): Plan {
  return { id: "7", createdDate: "2026-11-10", items, checklist: [], ...extra };
}

function renderPlan(items: PracticeItem[], extra: Partial<Plan> = {}) {
  return render(
    <PrintablePlan plan={plan(items, extra)} tracks={TRACKS} checklist={CHECKLIST} studentName="Xiami" />,
  );
}

afterEach(cleanup);

function practiceItems() {
  return within(screen.getByRole("list", { name: "Practice items" })).getAllByRole("listitem");
}

describe("PrintablePlan header", () => {
  it("titles the page with the student's name and shows the created date in full", () => {
    renderPlan([]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Xiami's practice plan");
    expect(screen.getByText(/Created Tuesday, November 10, 2026/)).toBeTruthy();
  });

  it("shows the plan description under the title only when set", () => {
    const { unmount } = renderPlan([], { description: "Week of Nov 10" });
    expect(screen.getByText("Week of Nov 10")).toBeTruthy();
    unmount();
    renderPlan([], { description: "" });
    expect(screen.queryByText("Week of Nov 10")).toBeNull();
  });

  it("lists each Get Ready checklist item with its emoji and reminder", () => {
    renderPlan([]);
    expect(screen.getByText(/🐭/).textContent).toContain("Three mouse holes on the bow hand");
    expect(screen.getByText(/🐻/).textContent).toContain("Baby bear gesture on the violin hand");
  });
});

describe("PrintablePlan items", () => {
  it("numbers items in plan order, using the item's own name or its primary track's name", () => {
    renderPlan([
      { trackChoices: ["twinkle-a"], tasks: [], dice: false, name: "Twinkle Variations" },
      { trackChoices: ["scale"], tasks: [], dice: false },
    ]);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["1. Twinkle Variations", "2. A Major Scale"]);
  });

  it("tags video tracks and leaves other tracks untagged", () => {
    renderPlan([
      { trackChoices: ["demo"], tasks: [], dice: false },
      { trackChoices: ["twinkle-a"], tasks: [], dice: false },
    ]);
    const items = practiceItems();
    expect(within(items[0]).getByText("video")).toBeTruthy();
    expect(within(items[1]).queryByText("video")).toBeNull();
  });

  it("shows a track's playback speed only when it is not 1", () => {
    renderPlan([
      {
        trackChoices: ["twinkle-a", "twinkle-b"],
        tasks: [{ type: "playWithTrack", count: 1 }],
        dice: false,
        trackSpeeds: { "twinkle-a": 0.75 },
      },
    ]);
    expect(screen.getByText(/Twinkle A \(0\.75×\)/)).toBeTruthy();
    expect(screen.getByText(/Twinkle B/).textContent).not.toMatch(/Twinkle B \(/);
  });

  it("shows the rotation only for rotating items", () => {
    renderPlan([
      { trackChoices: ["twinkle-a", "twinkle-b", "twinkle-c"], tasks: [], dice: false, perDay: 2 },
      { trackChoices: ["scale"], tasks: [], dice: false },
    ]);
    const items = practiceItems();
    expect(within(items[0]).getByText(/2 of 3 per day/)).toBeTruthy();
    expect(within(items[1]).queryByText(/per day/)).toBeNull();
  });

  it("lists tasks with their emoji, repeat count and focus passage", () => {
    renderPlan([
      {
        trackChoices: ["twinkle-a"],
        tasks: [
          { type: "sing", count: 1 },
          { type: "playWithTrack", count: 2 },
          { type: "playWithoutTrack", count: 1, focus: "bars 1–4" },
        ],
        dice: false,
      },
    ]);
    expect(screen.getByText("🎤 Sing ×1")).toBeTruthy();
    expect(screen.getByText("🎵 Play with track ×2")).toBeTruthy();
    expect(screen.getByText("🎻 Play without track ×1 — bars 1–4")).toBeTruthy();
  });

  it("lists die choices by face number when the die is on", () => {
    renderPlan([
      {
        trackChoices: ["scale", "twinkle-a"],
        tasks: [],
        dice: true,
        dieChoices: [
          { kind: "rhythm", rhythmId: "pepperoni" },
          { kind: "track", trackId: "twinkle-a" },
        ],
      },
    ]);
    const die = screen.getByText(/1 🍕 pepperoni pizza/).closest("p");
    expect(die?.textContent).toContain("🎲 Die");
    expect(die?.textContent).toContain("1 🍕 pepperoni pizza · 2 Twinkle A");
  });

  it("omits the die line when the die is off", () => {
    renderPlan([{ trackChoices: ["scale"], tasks: [], dice: false }]);
    expect(screen.queryByText(/🎲/)).toBeNull();
  });

  it("shows the teacher note", () => {
    renderPlan([
      { trackChoices: ["twinkle-a"], tasks: [], dice: false, teacherNote: "Keep the bow in the middle lane." },
    ]);
    expect(screen.getByText("Keep the bow in the middle lane.")).toBeTruthy();
  });
});
