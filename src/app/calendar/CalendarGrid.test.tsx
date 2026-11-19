// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

type SetDayTypeResult = { ok: true } | { ok: false; error: string };
const actions = vi.hoisted(() => ({
  setDayType: vi.fn(async (): Promise<SetDayTypeResult> => ({ ok: true })),
}));
vi.mock("../actions", () => actions);
import CalendarGrid from "./CalendarGrid";

const TODAY = "2026-06-15";
const progress = {
  "2026-06-01": { type: "practice" as const, done: 0, total: 3, ticked: false },
  "2026-06-02": { type: "practice" as const, done: 1, total: 3, ticked: true },
  "2026-06-03": { type: "non-practice" as const, dayTypeId: "individual-class", ticked: true },
};

beforeEach(() => {
  actions.setDayType.mockReset().mockResolvedValue({ ok: true });
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

  it("lets a ticked labelled day be cleared but not relabelled", async () => {
    grid();
    fireEvent.click(screen.getByRole("button", { name: /^3$/ }));
    const current = (await screen.findByRole("button", { name: /individual class/i })) as HTMLButtonElement;
    const other = screen.getByRole("button", { name: /sick/i }) as HTMLButtonElement;
    expect(current.disabled).toBe(false);
    expect(other.disabled).toBe(true);
    fireEvent.click(current);
    await waitFor(() => expect(actions.setDayType).toHaveBeenCalledWith("2026-06-03", null));
  });

  it("shows the action's refusal and stays open", async () => {
    actions.setDayType.mockResolvedValueOnce({
      ok: false,
      error: "Cannot relabel 2026-06-01: practice was logged that day",
    });
    grid();
    fireEvent.click(screen.getByRole("button", { name: /^1$/ }));
    fireEvent.click(await screen.findByRole("button", { name: /individual class/i }));
    expect(await screen.findByText(/Cannot relabel 2026-06-01/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /individual class/i })).toBeTruthy();
  });
});
