import { describe, it, expect } from "vitest";
import {
  needsReencode,
  BITRATE_CEILING,
  ffmpegArgs,
  newPathnameFor,
  atomsAreFaststart,
  parseInputBitrate,
} from "./video-recipe.mjs";

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

describe("newPathnameFor", () => {
  it("moves a Shortcut upload from tracks/ to videos/", () => {
    expect(newPathnameFor("x", "tracks/x.mp4")).toBe("videos/x.mp4");
  });
  it("adds a suffix when the video already lives at the target path", () => {
    expect(newPathnameFor("x", "videos/x.mp4")).toBe("videos/x-reencoded.mp4");
  });
});

describe("parseInputBitrate", () => {
  it("reads the kb/s figure from ffmpeg's input banner", () => {
    const stderr =
      "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':\n" +
      "  Duration: 00:00:58.03, start: 0.000000, bitrate: 5523 kb/s\n";
    expect(parseInputBitrate(stderr)).toBe(5_523_000);
  });
  it("returns null when ffmpeg prints N/A or nothing", () => {
    expect(parseInputBitrate("  Duration: N/A, bitrate: N/A\n")).toBeNull();
    expect(parseInputBitrate("")).toBeNull();
  });
});

describe("atomsAreFaststart", () => {
  // Minimal MP4 boxes: an 8-byte header (size, type) and no payload.
  const box = (type) => {
    const b = Buffer.alloc(8);
    b.writeUInt32BE(8, 0);
    b.write(type, 4, "latin1");
    return b;
  };
  it("is true when moov precedes mdat", () => {
    expect(atomsAreFaststart(Buffer.concat([box("ftyp"), box("moov"), box("mdat")]))).toBe(true);
  });
  it("is false when mdat precedes moov", () => {
    expect(atomsAreFaststart(Buffer.concat([box("ftyp"), box("mdat"), box("moov")]))).toBe(false);
  });
});
