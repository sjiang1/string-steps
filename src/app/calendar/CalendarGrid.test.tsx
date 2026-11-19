// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({ setDayType: vi.fn(async () => undefined) }));
vi.mock("../actions", () => actions);
import CalendarGrid from "./CalendarGrid";

const TODAY = "2026-06-15";
const progress = {
  "2026-06-01": { type: "practice" as const, done: 0, total: 3, ticked: false },
  "2026-06-02": { type: "practice" as const, done: 1, total: 3, ticked: true },
};

beforeEach(() => {
  actions.setDayType.mockReset().mockResolvedValue(undefined);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(progress)));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const grid = () =>
  render(<CalendarGrid initialYear={2026} initialMonth={5} progress={progress} today={TODAY} />);

describe("CalendarGrid past days", () => {
  it("opens the sheet for a past day and saves a label", async () => {
    grid();
    fireEvent.click(screen.getByRole("button", { name: /^1$/ }));
    fireEvent.click(await screen.findByRole("button", { name: /individual class/i }));
    await waitFor(() =>
      expect(actions.setDayType).toHaveBeenCalledWith("2026-06-01", "individual-class"),
    );
  });

  it("opens a ticked past day as blocked", async () => {
    grid();
    fireEvent.click(screen.getByRole("button", { name: /^2$/ }));
    const b = (await screen.findByRole("button", { name: /individual class/i })) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });

  it("shows the action's error and stays open", async () => {
    actions.setDayType.mockRejectedValueOnce(
      new Error("Cannot relabel 2026-06-01: practice was logged that day"),
    );
    grid();
    fireEvent.click(screen.getByRole("button", { name: /^1$/ }));
    fireEvent.click(await screen.findByRole("button", { name: /individual class/i }));
    expect(await screen.findByText(/Cannot relabel 2026-06-01/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /individual class/i })).toBeTruthy();
  });
});
