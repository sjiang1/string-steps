// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
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

describe("PracticeItemRow rotation", () => {
  const POOL_TRACKS: Track[] = ["p1", "p2", "p3", "p4"].map((id) => ({
    id,
    name: id.toUpperCase(),
    type: "reference" as const,
    file: null,
  }));
  const POOL: PracticeItem = { trackChoices: ["p1", "p2", "p3", "p4"], tasks: [], dice: false };

  function renderPoolRow(item: PracticeItem) {
    const onChange = vi.fn();
    render(
      <PracticeItemRow
        item={item}
        tracks={POOL_TRACKS}
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

  it("offers no Rotate control for a single-track item", () => {
    renderPoolRow({ ...POOL, trackChoices: ["p1"] });
    expect(screen.queryByLabelText("Rotate")).toBeNull();
  });

  it("turning Rotate on defaults to half the pool", () => {
    const onChange = renderPoolRow(POOL);
    fireEvent.click(screen.getByLabelText("Rotate"));
    expect(onChange).toHaveBeenCalledWith({ ...POOL, perDay: 2 });
  });

  it("changes the tracks-per-day number", () => {
    const onChange = renderPoolRow({ ...POOL, perDay: 2 });
    fireEvent.change(screen.getByLabelText("Tracks per day"), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith({ ...POOL, perDay: 3 });
  });

  it("turning Rotate off removes perDay", () => {
    const onChange = renderPoolRow({ ...POOL, perDay: 2 });
    fireEvent.click(screen.getByLabelText("Rotate"));
    expect(onChange).toHaveBeenCalledWith(POOL);
  });

  it("keeps the control visible when the pool shrank below perDay, so it can be fixed", () => {
    renderPoolRow({ ...POOL, trackChoices: ["p1"], perDay: 2 });
    expect(screen.getByLabelText("Rotate")).toBeTruthy();
  });

  it("enabling the die clears perDay", () => {
    const onChange = renderPoolRow({ ...POOL, perDay: 2 });
    fireEvent.click(screen.getByLabelText("Dice"));
    const next = onChange.mock.calls[0][0] as PracticeItem;
    expect(next.dice).toBe(true);
    expect(next.perDay).toBeUndefined();
  });
});

describe("PracticeItemRow per-track speed", () => {
  const AUDIO_TRACKS: Track[] = [
    { id: "s1", name: "Song 1", type: "audio", file: "/s1.mp3" },
    { id: "s2", name: "Song 2", type: "audio", file: "/s2.mp3" },
    { id: "v1", name: "Clip", type: "video", file: "/v1.mp4" },
  ];
  const POOL: PracticeItem = {
    trackChoices: ["s1", "s2", "v1"],
    tasks: [{ type: "playWithTrack", count: 1 }],
    dice: false,
  };

  function renderPool(item: PracticeItem) {
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

  it("shows a speed control for each audio track in a pool, none for video", () => {
    renderPool(POOL);
    expect(screen.getByRole("group", { name: "Playback speed for Song 1" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Playback speed for Song 2" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Playback speed for Clip" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Playback speed" })).toBeNull();
  });

  it("sets one track's speed in trackSpeeds", () => {
    const onChange = renderPool(POOL);
    const group = screen.getByRole("group", { name: "Playback speed for Song 2" });
    fireEvent.click(within(group).getByRole("button", { name: "0.75×" }));
    expect(onChange).toHaveBeenCalledWith({ ...POOL, trackSpeeds: { s2: 0.75 } });
  });

  it("setting a track back to 1× removes it, and the map when empty", () => {
    const onChange = renderPool({ ...POOL, trackSpeeds: { s2: 0.75 } });
    const group = screen.getByRole("group", { name: "Playback speed for Song 2" });
    fireEvent.click(within(group).getByRole("button", { name: "1×" }));
    expect(onChange).toHaveBeenCalledWith(POOL);
  });

  it("hides per-track speeds without a play-with-track task", () => {
    renderPool({ ...POOL, tasks: [{ type: "sing", count: 1 }] });
    expect(screen.queryByRole("group", { name: /Playback speed/ })).toBeNull();
  });
});
