// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PlanActionBar from "./PlanActionBar";

afterEach(cleanup);

const noop = () => {};

describe("PlanActionBar", () => {
  it("offers Add practice, Save, and Revert and acts on click", () => {
    const onAdd = vi.fn();
    const onSave = vi.fn();
    const onRevert = vi.fn();
    render(
      <PlanActionBar onAdd={onAdd} onSave={onSave} onRevert={onRevert} disabled={false} saving={false} invalid={false} problems={[]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add practice" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
    expect(onRevert).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /problems/ })).toBeNull();
  });

  it("blocks Save and reveals the messages behind ⚠ when there are problems", () => {
    render(
      <PlanActionBar
        onAdd={noop}
        onSave={noop}
        onRevert={noop}
        disabled={false}
        saving={false}
        invalid={true}
        problems={["Fill in every focus task’s sub-part label."]}
      />,
    );
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/sub-part label/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show problems" }));
    expect(screen.getByText(/sub-part label/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide problems" }));
    expect(screen.queryByText(/sub-part label/)).toBeNull();
  });

  it("keeps Save enabled after a failed save so it can be retried", () => {
    const onSave = vi.fn();
    render(
      <PlanActionBar
        onAdd={noop}
        onSave={onSave}
        onRevert={noop}
        disabled={false}
        saving={false}
        invalid={false}
        problems={["Network error"]}
      />,
    );
    expect(screen.getByRole("button", { name: "Show problems" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("disables everything but ⚠ while frozen or saving", () => {
    render(
      <PlanActionBar onAdd={noop} onSave={noop} onRevert={noop} disabled={true} saving={true} invalid={false} problems={["Boom"]} />,
    );
    expect((screen.getByRole("button", { name: "Add practice" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Revert" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Show problems" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
