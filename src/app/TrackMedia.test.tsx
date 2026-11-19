// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import TrackMedia from "./TrackMedia";
import type { Track } from "./plans";

const AUDIO: Track = { id: "a1", name: "Twinkle", type: "audio", file: "/audio/a1.mp3" };
const VIDEO: Track = { id: "v1", name: "Demo", type: "video", file: "/videos/v1.mp4" };
const REF: Track = { id: "r1", name: "A Major Scale", type: "reference", file: null };

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // jsdom does not implement media playback.
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
});
afterEach(cleanup);

const audioEl = () => document.querySelector("audio") as HTMLAudioElement;

describe("TrackMedia audio", () => {
  it("renders a Play button above the native player", () => {
    render(<TrackMedia track={AUDIO} speed={1} />);
    const button = screen.getByRole("button", { name: /play/i });
    expect(button.textContent).toBe("▶ Play");
    expect(audioEl().hasAttribute("controls")).toBe(true);
    expect(audioEl().getAttribute("src")).toBe("/audio/a1.mp3");
    expect(button.compareDocumentPosition(audioEl()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("tapping Play calls play(); tapping Pause calls pause()", () => {
    render(<TrackMedia track={AUDIO} speed={1} />);
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    expect(play).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent(audioEl(), new Event("play"));
    });
    Object.defineProperty(audioEl(), "paused", { configurable: true, value: false });
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("label follows the element's play event (native bar pressed)", () => {
    render(<TrackMedia track={AUDIO} speed={1} />);
    act(() => {
      fireEvent(audioEl(), new Event("play"));
    });
    expect(screen.getByRole("button").textContent).toBe("⏸ Pause");
    act(() => {
      fireEvent(audioEl(), new Event("pause"));
    });
    expect(screen.getByRole("button").textContent).toBe("▶ Play");
  });

  it("returns to Play on ended", () => {
    render(<TrackMedia track={AUDIO} speed={1} />);
    act(() => {
      fireEvent(audioEl(), new Event("play"));
    });
    act(() => {
      fireEvent(audioEl(), new Event("ended"));
    });
    expect(screen.getByRole("button").textContent).toBe("▶ Play");
  });

  it("returns to Play when the source is swapped mid-play (die roll)", () => {
    render(<TrackMedia track={AUDIO} speed={1} />);
    act(() => {
      fireEvent(audioEl(), new Event("play"));
    });
    // Changing src runs the load algorithm: paused becomes true and `emptied`
    // fires, but no `pause` event does.
    act(() => {
      fireEvent(audioEl(), new Event("emptied"));
    });
    expect(screen.getByRole("button").textContent).toBe("▶ Play");
  });

  it("returns to Play when the file fails to load after play", () => {
    render(<TrackMedia track={AUDIO} speed={1} />);
    act(() => {
      fireEvent(audioEl(), new Event("play"));
    });
    act(() => {
      fireEvent(audioEl(), new Event("error"));
    });
    expect(screen.getByRole("button").textContent).toBe("▶ Play");
  });

  it("decides play vs pause from the element, not the label", () => {
    // Label says Pause but the element is already paused (stale state):
    // a tap must start playback rather than pause nothing.
    render(<TrackMedia track={AUDIO} speed={1} />);
    act(() => {
      fireEvent(audioEl(), new Event("play"));
    });
    Object.defineProperty(audioEl(), "paused", { configurable: true, value: true });
    fireEvent.click(screen.getByRole("button"));
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });

  it("a rejected play() is swallowed and the label stays Play", async () => {
    play.mockImplementation(() => Promise.reject(new Error("NotAllowedError")));
    render(<TrackMedia track={AUDIO} speed={1} />);
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("button").textContent).toBe("▶ Play");
  });

  it("still applies the speed on loadedmetadata", () => {
    render(<TrackMedia track={AUDIO} speed={0.8} />);
    act(() => {
      fireEvent(audioEl(), new Event("loadedmetadata"));
    });
    expect(audioEl().playbackRate).toBe(0.8);
  });
});

describe("TrackMedia other types", () => {
  it("video keeps the native element and gets no button", () => {
    render(<TrackMedia track={VIDEO} speed={1} />);
    expect(document.querySelector("video")?.hasAttribute("controls")).toBe(true);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing for a reference track", () => {
    const { container } = render(<TrackMedia track={REF} speed={1} />);
    expect(container.innerHTML).toBe("");
  });
});
