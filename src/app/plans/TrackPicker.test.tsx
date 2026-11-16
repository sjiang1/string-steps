// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Track } from "../plans";
import TrackPicker from "./TrackPicker";

afterEach(cleanup);

describe("TrackPicker", () => {
  it("lists tracks sorted by name regardless of input order", () => {
    const tracks: Track[] = [
      { id: "z", name: "Zebra", type: "reference", file: null },
      { id: "a", name: "apple", type: "reference", file: null },
      { id: "m", name: "Minuet", type: "reference", file: null },
    ];
    render(<TrackPicker tracks={tracks} inPlan={[]} onPick={() => {}} onClose={() => {}} />);
    const names = screen
      .getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .filter((t) => t !== "×");
    expect(names).toEqual(["apple", "Minuet", "Zebra"]);
  });
});
