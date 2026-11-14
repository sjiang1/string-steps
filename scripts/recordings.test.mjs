import { describe, it, expect } from "vitest";
import { trackFromFilename, planRecordings } from "./recordings.mjs";

describe("trackFromFilename", () => {
  it("derives an audio track from an .m4a filename", () => {
    expect(trackFromFilename("twinkle_twinkle_piano.m4a")).toEqual({
      id: "twinkle_twinkle_piano",
      name: "twinkle twinkle piano",
      type: "audio",
      ext: ".m4a",
      contentType: "audio/mp4",
      blobPathname: "audio/twinkle_twinkle_piano.m4a",
      file: "/api/v/twinkle_twinkle_piano",
    });
  });
  it("maps .mp3 to audio/mpeg", () => {
    const t = trackFromFilename("scale_warmup.mp3");
    expect(t.type).toBe("audio");
    expect(t.contentType).toBe("audio/mpeg");
    expect(t.blobPathname).toBe("audio/scale_warmup.mp3");
    expect(t.file).toBe("/api/v/scale_warmup");
  });
  it("treats .mp4 as a video under videos/", () => {
    const t = trackFromFilename("demo_clip.mp4");
    expect(t.type).toBe("video");
    expect(t.blobPathname).toBe("videos/demo_clip.mp4");
  });
  it("throws on an unknown extension", () => {
    expect(() => trackFromFilename("note.wav")).toThrow();
  });
});

describe("planRecordings", () => {
  it("adds new files, skips registered ids, and skips unsupported extensions without throwing", () => {
    const files = ["new_song.m4a", "already_there.mp3", "raw_clip.MOV", ".DS_Store"];
    const { toAdd, skipped } = planRecordings(files, new Set(["already_there"]));
    expect(toAdd.map((x) => x.file)).toEqual(["new_song.m4a"]);
    expect(toAdd[0].track.id).toBe("new_song");
    expect(skipped).toEqual([
      { file: "already_there.mp3", reason: "already in tracks:list" },
      { file: "raw_clip.MOV", reason: "unsupported extension .MOV — convert videos to .mp4 first" },
    ]);
  });
  it("sorts files so output is deterministic", () => {
    const { toAdd } = planRecordings(["b.m4a", "a.m4a"], new Set());
    expect(toAdd.map((x) => x.file)).toEqual(["a.m4a", "b.m4a"]);
  });
});
