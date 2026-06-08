import { describe, it, expect } from "vitest";
import { needsReencode, BITRATE_CEILING, ffmpegArgs } from "./reencode-videos.mjs";

describe("needsReencode (audit predicate)", () => {
  it("conforming video (faststart, low bitrate) is not flagged", () => {
    expect(needsReencode({ faststart: true, bitrate: 1_200_000 })).toBe(false);
  });
  it("non-faststart video is flagged regardless of bitrate", () => {
    expect(needsReencode({ faststart: false, bitrate: 1_000_000 })).toBe(true);
  });
  it("over-bitrate video is flagged even if faststart", () => {
    expect(needsReencode({ faststart: true, bitrate: 5_500_000 })).toBe(true);
  });
  it("ceiling is 2.5 Mbps", () => {
    expect(BITRATE_CEILING).toBe(2_500_000);
    expect(needsReencode({ faststart: true, bitrate: 2_400_000 })).toBe(false);
    expect(needsReencode({ faststart: true, bitrate: 2_600_000 })).toBe(true);
  });
  it("unknown bitrate but faststart is not flagged (no false positive)", () => {
    expect(needsReencode({ faststart: true, bitrate: null })).toBe(false);
  });
});

describe("ffmpegArgs", () => {
  it("caps height at 720 without upscaling and uses faststart", () => {
    const args = ffmpegArgs("in.mp4", "out.mp4");
    const joined = args.join(" ");
    expect(joined).toContain("+faststart");
    expect(joined).toContain("libx264");
    expect(joined).toContain("min(720");
    expect(args[args.length - 1]).toBe("out.mp4");
  });
});
