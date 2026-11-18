import { describe, it, expect, beforeEach, vi } from "vitest";

const tools = vi.hoisted(() => ({
  downloadToFile: vi.fn(async () => undefined),
  inspectLocalVideo: vi.fn(async () => ({ faststart: true, bitrate: 1_200_000 })),
  encodeVideo: vi.fn(async () => undefined),
}));
const marks = vi.hoisted(() => ({
  clearReencodeMark: vi.fn(async () => undefined),
  recordReencodeError: vi.fn(async () => undefined),
}));
const blobs = vi.hoisted(() => ({ setTrackBlobUrl: vi.fn(async () => undefined) }));
const vercel = vi.hoisted(() => ({
  put: vi.fn(async () => ({ url: "https://s.public.blob.vercel-storage.com/videos/x.mp4" })),
  del: vi.fn(async () => undefined),
}));
const calls = vi.hoisted(() => [] as string[]);

vi.mock("./video-tools", () => tools);
vi.mock("./reencode-marks", () => marks);
vi.mock("./track-blobs", () => blobs);
vi.mock("@vercel/blob", () => vercel);
vi.mock("fs/promises", async (orig) => ({
  ...(await orig<typeof import("fs/promises")>()),
  readFile: async () => Buffer.from("encoded"),
}));

import { runReencodeJob } from "./reencode-job";

const OLD_URL = "https://s.public.blob.vercel-storage.com/tracks/x.mp4";

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  tools.inspectLocalVideo.mockResolvedValue({ faststart: true, bitrate: 1_200_000 });
  blobs.setTrackBlobUrl.mockImplementation(async () => {
    calls.push("setTrackBlobUrl");
  });
  marks.clearReencodeMark.mockImplementation(async () => {
    calls.push("clearReencodeMark");
  });
  vercel.del.mockImplementation(async () => {
    calls.push("del");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runReencodeJob", () => {
  it("clears the mark and uploads nothing for a conforming video", async () => {
    await runReencodeJob("x", OLD_URL);
    expect(tools.downloadToFile).toHaveBeenCalledWith(OLD_URL, expect.stringMatching(/x\.in\.mp4$/));
    expect(vercel.put).not.toHaveBeenCalled();
    expect(tools.encodeVideo).not.toHaveBeenCalled();
    expect(marks.clearReencodeMark).toHaveBeenCalledWith("x");
    expect(blobs.setTrackBlobUrl).not.toHaveBeenCalled();
  });

  it("re-encodes, uploads to videos/<id>.mp4, repoints, clears, deletes", async () => {
    tools.inspectLocalVideo.mockResolvedValue({ faststart: false, bitrate: 5_500_000 });
    await runReencodeJob("x", OLD_URL);
    expect(tools.encodeVideo).toHaveBeenCalledWith(
      expect.stringMatching(/x\.in\.mp4$/),
      expect.stringMatching(/x\.out\.mp4$/),
    );
    expect(vercel.put).toHaveBeenCalledWith("videos/x.mp4", expect.anything(), {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    expect(blobs.setTrackBlobUrl).toHaveBeenCalledWith(
      "x",
      "https://s.public.blob.vercel-storage.com/videos/x.mp4",
    );
    expect(vercel.del).toHaveBeenCalledWith(OLD_URL);
    expect(calls).toEqual(["setTrackBlobUrl", "clearReencodeMark", "del"]);
    expect(marks.recordReencodeError).not.toHaveBeenCalled();
  });

  it("records the error when the download fails", async () => {
    tools.downloadToFile.mockRejectedValueOnce(new Error("download failed: 404"));
    await runReencodeJob("x", OLD_URL);
    expect(marks.recordReencodeError).toHaveBeenCalledWith("x", expect.stringMatching(/download failed/));
    expect(blobs.setTrackBlobUrl).not.toHaveBeenCalled();
    expect(vercel.put).not.toHaveBeenCalled();
    expect(marks.clearReencodeMark).not.toHaveBeenCalled();
  });

  it("leaves track:blob alone when the upload fails", async () => {
    tools.inspectLocalVideo.mockResolvedValue({ faststart: false, bitrate: 5_500_000 });
    vercel.put.mockRejectedValueOnce(new Error("blob down"));
    await runReencodeJob("x", OLD_URL);
    expect(blobs.setTrackBlobUrl).not.toHaveBeenCalled();
    expect(marks.clearReencodeMark).not.toHaveBeenCalled();
    expect(vercel.del).not.toHaveBeenCalled();
    expect(marks.recordReencodeError).toHaveBeenCalledWith("x", "blob down");
  });

  it("clears the mark even when deleting the original fails", async () => {
    tools.inspectLocalVideo.mockResolvedValue({ faststart: false, bitrate: 5_500_000 });
    vercel.del.mockRejectedValueOnce(new Error("del failed"));
    await runReencodeJob("x", OLD_URL);
    expect(marks.clearReencodeMark).toHaveBeenCalledWith("x");
    expect(marks.recordReencodeError).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("does not reject when recording the error fails", async () => {
    tools.downloadToFile.mockRejectedValueOnce(new Error("download failed: 500"));
    marks.recordReencodeError.mockRejectedValueOnce(new Error("redis down"));
    await expect(runReencodeJob("x", OLD_URL)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
