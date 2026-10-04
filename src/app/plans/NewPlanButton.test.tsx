// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { Plan } from "../plans";

const createPlan = vi.fn(async () => ({ id: "9" }));
vi.mock("../actions", () => ({ createPlan: (...args: unknown[]) => createPlan(...(args as [])) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import NewPlanButton from "./NewPlanButton";

const SOURCE: Plan = {
  id: "1",
  createdDate: "2026-10-01",
  items: [
    {
      trackChoices: ["song"],
      tasks: [{ type: "playWithTrack", count: 1 }],
      dice: false,
      speed: 0.75,
    },
  ],
  checklist: [],
};

afterEach(cleanup);

describe("NewPlanButton", () => {
  it("carries each item's playback speed into the new plan", async () => {
    render(<NewPlanButton sourcePlan={SOURCE} defaultActiveFrom="2026-10-05" />);
    fireEvent.click(screen.getByRole("button", { name: "+ New plan" }));
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(createPlan).toHaveBeenCalled());
    const draft = (createPlan.mock.calls[0] as unknown as [Plan])[0];
    expect(draft.items[0].speed).toBe(0.75);
  });
});
