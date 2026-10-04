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

describe("PracticeItemRow playback speed", () => {
  const AUDIO_TRACKS: Track[] = [
    { id: "s", name: "Song", type: "audio", file: "/s.mp3" },
    { id: "v", name: "Clip", type: "video", file: "/v.mp4" },
  ];
  const ELIGIBLE: PracticeItem = {
    trackChoices: ["s"],
    tasks: [{ type: "playWithTrack", count: 1 }],
    dice: false,
  };

  function renderSpeedRow(item: PracticeItem) {
    const onChange = vi.fn();
    render(
      <PracticeItemRow
        item={item}
        tracks={AUDIO_TRACKS}
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

  it("marks 1× as selected for an eligible item without a speed", () => {
    renderSpeedRow(ELIGIBLE);
    expect(screen.getByRole("group", { name: "Playback speed" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1×" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("sets the speed when a slower option is picked", () => {
    const onChange = renderSpeedRow(ELIGIBLE);
    fireEvent.click(screen.getByRole("button", { name: "0.75×" }));
    expect(onChange).toHaveBeenCalledWith({ ...ELIGIBLE, speed: 0.75 });
  });

  it("clears the speed when 1× is picked", () => {
    const onChange = renderSpeedRow({ ...ELIGIBLE, speed: 0.5 });
    fireEvent.click(screen.getByRole("button", { name: "1×" }));
    expect(onChange).toHaveBeenCalledWith({ ...ELIGIBLE, speed: undefined });
  });

  it("offers no speed choice without a play-with-track task", () => {
    renderSpeedRow({ ...ELIGIBLE, tasks: [{ type: "sing", count: 1 }] });
    expect(screen.queryByRole("group", { name: "Playback speed" })).toBeNull();
  });

  it("offers no speed choice for a multi-track item", () => {
    renderSpeedRow({ ...ELIGIBLE, trackChoices: ["s", "v"] });
    expect(screen.queryByRole("group", { name: "Playback speed" })).toBeNull();
  });

  it("offers no speed choice for a video track", () => {
    renderSpeedRow({ ...ELIGIBLE, trackChoices: ["v"] });
    expect(screen.queryByRole("group", { name: "Playback speed" })).toBeNull();
  });
});
