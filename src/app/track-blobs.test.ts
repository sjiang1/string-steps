import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let dir: string;
let file: string;

beforeEach(() => {
  // Fresh module per test so TRACK_BLOBS_JSON_PATH is read for this test's file.
  vi.resetModules();
  dir = mkdtempSync(join(tmpdir(), "track-blobs-test-"));
  file = join(dir, "track-blobs.json");
  writeFileSync(file, JSON.stringify({}));
  process.env.TRACK_BLOBS_JSON_PATH = file;
});

afterEach(() => {
  delete process.env.TRACK_BLOBS_JSON_PATH;
  rmSync(dir, { recursive: true, force: true });
});

describe("track blobs store", () => {
  it("returns an empty map when the file holds {}", async () => {
    const { getTrackBlobs } = await import("./track-blobs");
    expect(await getTrackBlobs()).toEqual({});
  });

  it("keeps entries written by someone else", async () => {
    writeFileSync(file, JSON.stringify({ a: "https://blob/a.mp4" }));
    const { setTrackBlobUrl, getTrackBlobs } = await import("./track-blobs");
    await setTrackBlobUrl("b", "https://blob/b.mp4");
    // Someone else (the manual script, another request) writes between calls.
    writeFileSync(
      file,
      JSON.stringify({ a: "https://blob/a2.mp4", b: "https://blob/b.mp4" }),
    );
    await setTrackBlobUrl("c", "https://blob/c.mp4");
    expect(await getTrackBlobs()).toEqual({
      a: "https://blob/a2.mp4",
      b: "https://blob/b.mp4",
      c: "https://blob/c.mp4",
    });
  });
});
