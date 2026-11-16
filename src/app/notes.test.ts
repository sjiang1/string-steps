import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let dir: string;
let file: string;

beforeEach(() => {
  // Fresh module per test: storage.ts decides Redis-or-file at import time.
  vi.resetModules();
  delete process.env.KV_REST_API_URL;
  dir = mkdtempSync(join(tmpdir(), "notes-test-"));
  file = join(dir, "notes-log.json");
  writeFileSync(file, JSON.stringify({}));
  process.env.NOTES_LOG_PATH = file;
});

afterEach(() => {
  delete process.env.NOTES_LOG_PATH;
  rmSync(dir, { recursive: true, force: true });
});

const fileJson = () => JSON.parse(readFileSync(file, "utf-8"));

describe("notes store", () => {
  it("setNote stores trimmed text and getNotes returns it", async () => {
    const { setNote, getNotes } = await import("./notes");
    await setNote("2026-05-01", "twinkle", "  still slipping on C  ");
    expect(await getNotes("2026-05-01")).toEqual({ twinkle: "still slipping on C" });
    expect(await getNotes("2026-05-02")).toEqual({});
  });

  it("an empty note deletes the field and an empty day leaves the file", async () => {
    const { setNote, getNotes } = await import("./notes");
    await setNote("2026-05-01", "twinkle", "good");
    await setNote("2026-05-01", "scale", "ok");
    await setNote("2026-05-01", "twinkle", "   ");
    expect(await getNotes("2026-05-01")).toEqual({ scale: "ok" });
    await setNote("2026-05-01", "scale", "");
    expect(fileJson()).toEqual({});
  });

  it("a note that looks like JSON is stored and read as text", async () => {
    const { setNote, getNotes } = await import("./notes");
    await setNote("2026-05-01", "t", "5");
    expect((await getNotes("2026-05-01")).t).toBe("5");
    expect(fileJson()).toEqual({ "2026-05-01": { t: "5" } });
  });
});
