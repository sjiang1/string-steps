// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { PracticeItem, Track } from "../plans";
import PracticeItemRow from "./PracticeItemRow";

const TRACKS: Track[] = [{ id: "a", name: "Track A", type: "reference", file: null }];
const ITEM: PracticeItem = { trackChoices: ["a"], tasks: [], dice: false };

function renderRow(item: PracticeItem) {
  const onChange = vi.fn();
  render(
    <PracticeItemRow
      item={item}
      tracks={TRACKS}
      disabled={false}
      invalidTaskIndices={new Set()}
      onChange={onChange}
      onAddTrack={() => {}}
      onReplaceTrack={() => {}}
      onRemoveTrack={() => {}}
      onRemove={() => {}}
    />,
  );
  return onChange;
}

afterEach(cleanup);

describe("PracticeItemRow item name", () => {
  it("headers an unnamed item with its primary track's name", () => {
    renderRow(ITEM);
    expect(screen.getByRole("heading", { name: "Track A" })).toBeTruthy();
  });

  it("headers a named item with its own name", () => {
    renderRow({ ...ITEM, name: "Twinkle Twinkle" });
    expect(screen.getByRole("heading", { name: "Twinkle Twinkle" })).toBeTruthy();
  });

  it("sets the name from the item-name input on blur", () => {
    const onChange = renderRow(ITEM);
    const input = screen.getByLabelText("Item name");
    fireEvent.change(input, { target: { value: "  Twinkle Twinkle " } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ ...ITEM, name: "Twinkle Twinkle" });
  });

  it("clears the name when the input is emptied", () => {
    const onChange = renderRow({ ...ITEM, name: "Twinkle Twinkle" });
    const input = screen.getByLabelText("Item name");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ ...ITEM, name: undefined });
  });
});
