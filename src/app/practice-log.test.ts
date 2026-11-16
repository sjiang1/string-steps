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
  dir = mkdtempSync(join(tmpdir(), "practice-log-test-"));
  file = join(dir, "practice-log.json");
  writeFileSync(file, JSON.stringify({}));
  process.env.PRACTICE_LOG_PATH = file;
});

afterEach(() => {
  delete process.env.PRACTICE_LOG_PATH;
  rmSync(dir, { recursive: true, force: true });
});

describe("practice log store", () => {
  it("getDone returns [] for a day with no entry", async () => {
    const { getDone } = await import("./practice-log");
    expect(await getDone("2026-01-01")).toEqual([]);
  });

  it("toggleDone adds a key then removes it on the second call", async () => {
    const { toggleDone, getDone } = await import("./practice-log");
    expect(await toggleDone("2026-01-01", "a-sing-0")).toEqual(["a-sing-0"]);
    expect(await toggleDone("2026-01-01", "a-sing-0")).toEqual([]);
    expect(await getDone("2026-01-01")).toEqual([]);
    expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({});
  });

  it("toggleDone on two different keys keeps both", async () => {
    const { toggleDone } = await import("./practice-log");
    await toggleDone("2026-01-01", "a-sing-0");
    const done = await toggleDone("2026-01-01", "a-play-0");
    expect(done.sort()).toEqual(["a-play-0", "a-sing-0"]);
  });

  it("a linked account's logId is a separate day", async () => {
    const { toggleDone, getDone } = await import("./practice-log");
    await toggleDone("2026-01-01", "a-sing-0");
    await toggleDone("2026-01-01:mama", "b-sing-0");
    expect(await getDone("2026-01-01")).toEqual(["a-sing-0"]);
    expect(await getDone("2026-01-01:mama")).toEqual(["b-sing-0"]);
    expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({
      "2026-01-01": ["a-sing-0"],
      "2026-01-01:mama": ["b-sing-0"],
    });
  });
});
