// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DaySheet from "./DaySheet";

afterEach(cleanup);

const onApply = vi.fn();
const base = { date: "2026-06-01", currentDayTypeId: null, error: null, onApply, onClose: vi.fn() };

beforeEach(() => onApply.mockClear());

const labelButtons = () =>
  screen.getAllByRole("button", { name: /class|sick/i }) as HTMLButtonElement[];

describe("DaySheet", () => {
  it("disables the labels and explains when the day is blocked", () => {
    render(<DaySheet {...base} past blocked />);
    for (const b of labelButtons()) expect(b.disabled).toBe(true);
    expect(
      screen.getByText("Practice was ticked on this day, so it can't be changed to a class or sick day."),
    ).toBeTruthy();
  });

  it("explains restore-on-clear for a past day that is not blocked", () => {
    render(<DaySheet {...base} past blocked={false} />);
    expect(
      screen.getByText("Clearing a label puts the day back to the plan that was active then."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /individual class/i }));
    expect(onApply).toHaveBeenCalledWith("individual-class");
  });

  it("keeps today's wording for today and future days", () => {
    render(<DaySheet {...base} past={false} blocked={false} />);
    expect(screen.getByText(/become a normal practice day/)).toBeTruthy();
    for (const b of labelButtons()) expect(b.disabled).toBe(false);
  });

  it("shows the action's error text", () => {
    render(
      <DaySheet
        {...base}
        past
        blocked={false}
        error="Cannot relabel 2026-06-01: practice was logged that day"
      />,
    );
    expect(screen.getByText("Cannot relabel 2026-06-01: practice was logged that day")).toBeTruthy();
  });
});
