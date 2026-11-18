import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let dir: string;
let file: string;
const T = new Date("2026-11-14T10:00:00.000Z");

beforeEach(() => {
  // Fresh module per test: storage.ts decides Redis-or-file at import time.
  vi.resetModules();
  vi.restoreAllMocks();
  delete process.env.KV_REST_API_URL;
  dir = mkdtempSync(join(tmpdir(), "reencode-marks-test-"));
  file = join(dir, "track-reencode.json");
  writeFileSync(file, JSON.stringify({}));
  process.env.TRACK_REENCODE_JSON_PATH = file;
});

afterEach(() => {
  delete process.env.TRACK_REENCODE_JSON_PATH;
  rmSync(dir, { recursive: true, force: true });
});

const fileJson = () => JSON.parse(readFileSync(file, "utf-8"));

describe("re-encode marks store", () => {
  it("marks with the given time and clears", async () => {
    const { markReencoding, clearReencodeMark, getReencodeMarks } = await import("./reencode-marks");
    await markReencoding("x", T);
    expect(await getReencodeMarks()).toEqual({ x: { since: "2026-11-14T10:00:00.000Z" } });
    await clearReencodeMark("x");
    expect(await getReencodeMarks()).toEqual({});
    expect(fileJson()).toEqual({});
  });

  it("records an error without losing since", async () => {
    const { markReencoding, recordReencodeError, getReencodeMarks } = await import("./reencode-marks");
    await markReencoding("x", T);
    await recordReencodeError("x", "boom");
    expect(await getReencodeMarks()).toEqual({
      x: { since: "2026-11-14T10:00:00.000Z", error: "boom" },
    });
  });

  it("records an error for an unmarked id", async () => {
    const { recordReencodeError, getReencodeMarks } = await import("./reencode-marks");
    await recordReencodeError("y", "boom");
    const marks = await getReencodeMarks();
    expect(marks.y.error).toBe("boom");
    expect(typeof marks.y.since).toBe("string");
    expect(Number.isNaN(Date.parse(marks.y.since))).toBe(false);
  });

  it("clearing one id leaves the others untouched", async () => {
    const { markReencoding, clearReencodeMark, getReencodeMarks } = await import("./reencode-marks");
    await markReencoding("a", T);
    await markReencoding("b", T);
    await clearReencodeMark("a");
    expect(await getReencodeMarks()).toEqual({ b: { since: "2026-11-14T10:00:00.000Z" } });
  });

  it("treats a non-object dev value as no marks", async () => {
    writeFileSync(file, JSON.stringify("oops"));
    const { getReencodeMarks } = await import("./reencode-marks");
    expect(await getReencodeMarks()).toEqual({});
  });

  it("ignores a field whose value is not a mark", async () => {
    writeFileSync(file, JSON.stringify({ a: "junk", b: { since: "2026-11-14T10:00:00.000Z" } }));
    const { getReencodeMarks } = await import("./reencode-marks");
    expect(await getReencodeMarks()).toEqual({ b: { since: "2026-11-14T10:00:00.000Z" } });
  });

  it("returns no marks and logs when the store read throws", async () => {
    vi.doMock("./storage", async (orig) => ({
      ...(await orig<typeof import("./storage")>()),
      hashGetAll: async () => {
        throw new Error("WRONGTYPE");
      },
    }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getReencodeMarks } = await import("./reencode-marks");
    expect(await getReencodeMarks()).toEqual({});
    expect(err).toHaveBeenCalled();
    vi.doUnmock("./storage");
  });
});
