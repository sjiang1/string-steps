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
  dir = mkdtempSync(join(tmpdir(), "schedule-test-"));
  file = join(dir, "plan-schedule.json");
  writeFileSync(file, JSON.stringify({}));
  process.env.SCHEDULE_JSON_PATH = file;
});

afterEach(() => {
  delete process.env.SCHEDULE_JSON_PATH;
  rmSync(dir, { recursive: true, force: true });
});

const fileJson = () => JSON.parse(readFileSync(file, "utf-8"));

describe("schedule store", () => {
  it("setScheduleEntryIfAbsent writes once and reports false the second time", async () => {
    const { setScheduleEntryIfAbsent, getScheduleMap } = await import("./schedule");
    expect(await setScheduleEntryIfAbsent("2026-05-23", "3")).toBe(true);
    expect(await setScheduleEntryIfAbsent("2026-05-23", "4")).toBe(false);
    expect(await getScheduleMap()).toEqual({ "2026-05-23": "3" });
  });

  it("writeScheduleDiff writes only the dates whose value changed", async () => {
    writeFileSync(file, JSON.stringify({ a: "0", b: "1" }));
    const { writeScheduleDiff } = await import("./schedule");
    await writeScheduleDiff({ a: "0", b: "1" }, { a: "0", b: "2", c: "2" });
    expect(fileJson()).toEqual({ a: "0", b: "2", c: "2" });
  });

  it("deleteScheduleEntry removes the date", async () => {
    writeFileSync(file, JSON.stringify({ a: "0", b: "sick" }));
    const { deleteScheduleEntry, setScheduleEntry, getScheduleMap } = await import("./schedule");
    await deleteScheduleEntry("b");
    await setScheduleEntry("c", "group-class");
    expect(await getScheduleMap()).toEqual({ a: "0", c: "group-class" });
  });
});
