import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { needsReencode } from "../../scripts/video-recipe.mjs";
import { ffmpegBinary, inspectLocalVideo, encodeVideo, downloadToFile, blobExists } from "./video-tools";

const execFileP = promisify(execFile);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "video-tools-test-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("video tools (real ffmpeg-static)", () => {
  it("detects a non-faststart clip and produces a conforming one", async () => {
    const src = join(dir, "src.mp4");
    const out = join(dir, "out.mp4");
    // A synthetic 1 s clip; ffmpeg writes moov after mdat unless asked otherwise.
    await execFileP(ffmpegBinary(), [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=10",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-c:v", "libx264", "-c:a", "aac", "-shortest", src,
    ]);
    const before = await inspectLocalVideo(src);
    expect(before.faststart).toBe(false);
    expect(typeof before.bitrate).toBe("number");
    await encodeVideo(src, out);
    const after = await inspectLocalVideo(out);
    expect(after.faststart).toBe(true);
    expect(needsReencode(after)).toBe(false);
  }, 30_000);

  it("downloadToFile writes the body and rejects a non-2xx response", async () => {
    const path = join(dir, "dl.bin");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("hello", { status: 200 }));
    await downloadToFile("https://example.test/a.mp4", path);
    expect(readFileSync(path, "utf-8")).toBe("hello");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("nope", { status: 404 }));
    await expect(downloadToFile("https://example.test/b.mp4", path)).rejects.toThrow(
      "download failed: 404",
    );
  });

  it("blobExists asks with HEAD and reports a 404 as absent", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await blobExists("https://example.test/a.mp4")).toBe(true);
    expect(await blobExists("https://example.test/gone.mp4")).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/a.mp4", { method: "HEAD" });
  });
});
