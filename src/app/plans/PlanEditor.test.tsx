// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Plan } from "../plans";

vi.mock("../actions", () => ({ savePlan: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import PlanEditor from "./PlanEditor";

const PLAN: Plan = {
  id: "1",
  createdDate: "2026-11-10",
  description: "Week of Nov 10",
  items: [],
  checklist: [],
};

afterEach(cleanup);

describe("PlanEditor print button", () => {
  it("links to the printable plan while there are no unsaved edits", () => {
    render(<PlanEditor plan={PLAN} tracks={[]} frozen={false} printable />);
    const link = screen.getByRole("link", { name: /print/i });
    expect(link.getAttribute("href")).toBe("/plans/print?id=1");
    expect(screen.queryByText("Save first")).toBeNull();
  });

  it("asks for a save instead of printing once the draft has unsaved edits", () => {
    render(<PlanEditor plan={PLAN} tracks={[]} frozen={false} printable />);
    fireEvent.change(screen.getByPlaceholderText("Short description of this plan"), {
      target: { value: "Week of Nov 17" },
    });
    expect(screen.queryByRole("link", { name: /print/i })).toBeNull();
    expect(screen.getByText("Save first")).toBeTruthy();
  });

  it("prints again after the edits are reverted", () => {
    render(<PlanEditor plan={PLAN} tracks={[]} frozen={false} printable />);
    fireEvent.change(screen.getByPlaceholderText("Short description of this plan"), {
      target: { value: "Week of Nov 17" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(screen.getByRole("link", { name: /print/i })).toBeTruthy();
  });

  it("has no print button for accounts that cannot print", () => {
    render(<PlanEditor plan={PLAN} tracks={[]} frozen={false} printable={false} />);
    expect(screen.queryByRole("link", { name: /print/i })).toBeNull();
    expect(screen.queryByText(/print/i)).toBeNull();
  });
});

const TRACKS = [
  { id: "a", name: "Track A", type: "reference" as const, file: null },
  { id: "b", name: "Track B", type: "reference" as const, file: null },
  { id: "c", name: "Track C", type: "reference" as const, file: null },
];
const ONE_ITEM_PLAN: Plan = {
  ...PLAN,
  items: [{ trackChoices: ["a"], tasks: [], dice: false }],
};

/** Item names in list order (the picker is closed, so every h3 is an item). */
function itemNames() {
  return screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
}

function addPractice(trackName: string, placement?: "Top" | "Bottom") {
  fireEvent.click(screen.getByRole("button", { name: "Add practice" }));
  if (placement) fireEvent.click(screen.getByRole("radio", { name: placement }));
  fireEvent.click(screen.getByRole("button", { name: trackName }));
}

describe("PlanEditor add-practice placement", () => {
  it("adds a new practice at the bottom by default", () => {
    render(<PlanEditor plan={ONE_ITEM_PLAN} tracks={TRACKS} frozen={false} />);
    addPractice("Track B");
    expect(itemNames()).toEqual(["Track A", "Track B"]);
  });

  it("adds a new practice at the top when Top is chosen", () => {
    render(<PlanEditor plan={ONE_ITEM_PLAN} tracks={TRACKS} frozen={false} />);
    addPractice("Track B", "Top");
    expect(itemNames()).toEqual(["Track B", "Track A"]);
  });

  it("uses native radios so the group gets arrow-key navigation and one Tab stop", () => {
    render(<PlanEditor plan={ONE_ITEM_PLAN} tracks={TRACKS} frozen={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Add practice" }));
    const top = screen.getByRole("radio", { name: "Top" }) as HTMLInputElement;
    const bottom = screen.getByRole("radio", { name: "Bottom" }) as HTMLInputElement;
    expect(bottom.checked).toBe(true);
    fireEvent.click(top);
    expect(top.checked).toBe(true);
    expect(bottom.checked).toBe(false);
  });

  it("remembers the chosen placement for the next add", () => {
    render(<PlanEditor plan={ONE_ITEM_PLAN} tracks={TRACKS} frozen={false} />);
    addPractice("Track B", "Top");
    addPractice("Track C");
    expect(itemNames()).toEqual(["Track C", "Track B", "Track A"]);
  });

  it("offers no placement choice when adding a track to an item's pool", () => {
    render(<PlanEditor plan={ONE_ITEM_PLAN} tracks={TRACKS} frozen={false} />);
    fireEvent.click(screen.getByRole("button", { name: "+ add track" }));
    expect(screen.getByRole("heading", { name: "Add track to pool" })).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "Place at" })).toBeNull();
  });
});
