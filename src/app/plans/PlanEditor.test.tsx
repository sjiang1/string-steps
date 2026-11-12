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
