import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { TEST_PRIMARY as PRIMARY, TEST_LINKED as LINKED, TEST_TEACHER } from "./test-support/people";
import { TEST_PLANS, TEST_PLAN_TASK_TOTAL } from "./test-support/seed";

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "activeStudentId" && cookieState.value
        ? { value: cookieState.value }
        : undefined,
  }),
}));

let tempDir: string;
let tempFile: string;
let notesFile: string;
let scheduleFile: string;

beforeEach(() => {
  // vi.resetModules() clears Node's module cache so that each test gets a
  // fresh import of actions.ts. Without this, the module-level LOG_PATH
  // would be evaluated once and reused across all tests, pointing at the
  // first test's temp file instead of the current one.
  vi.resetModules();
  cookieState.value = undefined;
  tempDir = mkdtempSync(join(tmpdir(), "practice-log-test-"));
  tempFile = join(tempDir, "practice-log.json");
  writeFileSync(tempFile, JSON.stringify({}));
  // PRACTICE_LOG_PATH overrides the default LOG_PATH in actions.ts so
  // tests write to a temp file instead of the real practice-log.json.
  process.env.PRACTICE_LOG_PATH = tempFile;
  notesFile = join(tempDir, "notes-log.json");
  writeFileSync(notesFile, JSON.stringify({}));
  // NOTES_LOG_PATH overrides the default NOTES_PATH in actions.ts so tests
  // write to a temp file instead of the real data/notes-log.json.
  process.env.NOTES_LOG_PATH = notesFile;
  scheduleFile = join(tempDir, "plan-schedule.json");
  writeFileSync(scheduleFile, JSON.stringify({}));
  // SCHEDULE_JSON_PATH overrides the default SCHEDULE_PATH so the new
  // getSchedule auto-fill behavior never writes to the real data file
  // during tests. Individual tests can still seed schedule data via
  // setupScheduleData (which writes to the same path).
  process.env.SCHEDULE_JSON_PATH = scheduleFile;
});

afterEach(() => {
  delete process.env.PRACTICE_LOG_PATH;
  delete process.env.SCHEDULE_JSON_PATH;
  delete process.env.PLANS_JSON_PATH;
  delete process.env.TRACKS_JSON_PATH;
  delete process.env.TRACK_BLOBS_JSON_PATH;
  delete process.env.STUDENTS_JSON_PATH;
  delete process.env.NOTES_LOG_PATH;
  try {
    unlinkSync(tempFile);
  } catch {}
});

function setupScheduleData(data: Record<string, string>): void {
  const file = join(tempDir, "plan-schedule.json");
  writeFileSync(file, JSON.stringify(data));
  process.env.SCHEDULE_JSON_PATH = file;
}

function setupPlansData(data: unknown): void {
  const file = join(tempDir, "plans.json");
  writeFileSync(file, JSON.stringify(data));
  process.env.PLANS_JSON_PATH = file;
}

function setupTracksData(data: unknown): string {
  const file = join(tempDir, "tracks.json");
  writeFileSync(file, JSON.stringify(data));
  process.env.TRACKS_JSON_PATH = file;
  return file;
}

function setupTrackBlobsData(data: Record<string, string>): string {
  const file = join(tempDir, "track-blobs.json");
  writeFileSync(file, JSON.stringify(data));
  process.env.TRACK_BLOBS_JSON_PATH = file;
  return file;
}

// The committed seed ships a single (primary) student (#37). Tests that exercise
// linked-account behavior must configure a linked account, mirroring the real
// opt-in: add a linked entry to the roster (here via the JSON store).
function setupStudentsData(data: unknown): string {
  const file = join(tempDir, "students.json");
  writeFileSync(file, JSON.stringify(data));
  process.env.STUDENTS_JSON_PATH = file;
  return file;
}

// Dynamic import so the module reads the current PRACTICE_LOG_PATH env var
async function loadActions() {
  const mod = await import("./actions");
  return mod;
}

describe("getDoneTasks", () => {
  it("returns empty array for unknown date", async () => {
    const { getDoneTasks } = await loadActions();
    const result = await getDoneTasks("2026-01-01", PRIMARY);
    expect(result).toEqual([]);
  });

  it("returns stored tasks for a known date", async () => {
    const data = { "2026-04-09": ["scale-playWithTrack-0"] };
    writeFileSync(tempFile, JSON.stringify(data));
    const { getDoneTasks } = await loadActions();
    const result = await getDoneTasks("2026-04-09", PRIMARY);
    expect(result).toEqual(["scale-playWithTrack-0"]);
  });
});

describe("toggleTask", () => {
  it("adds a task when not present", async () => {
    const { toggleTask } = await loadActions();
    const result = await toggleTask("2026-04-09", "scale-sing-0");
    expect(result).toEqual(["scale-sing-0"]);
  });

  it("removes a task when already present", async () => {
    const data = { "2026-04-09": ["scale-sing-0", "scale-play-0"] };
    writeFileSync(tempFile, JSON.stringify(data));
    const { toggleTask } = await loadActions();
    const result = await toggleTask("2026-04-09", "scale-sing-0");
    expect(result).toEqual(["scale-play-0"]);
  });

  it("persists state across calls", async () => {
    const { toggleTask, getDoneTasks } = await loadActions();
    await toggleTask("2026-04-09", "scale-sing-0");
    const result = await getDoneTasks("2026-04-09", PRIMARY);
    expect(result).toEqual(["scale-sing-0"]);
  });
});

describe("getMonthProgress", () => {
  it("returns practice progress for days with plans", async () => {
    setupScheduleData({ "2026-04-10": "1" });
    setupPlansData(TEST_PLANS);
    const data = {
      "2026-04-10": ["demo-a-playWithTrack-0", "demo-b-playWithoutTrack-0"],
    };
    writeFileSync(tempFile, JSON.stringify(data));
    const { getMonthProgress } = await loadActions();
    const result = await getMonthProgress("2026-04");
    expect(result["2026-04-10"]).toEqual({
      type: "practice",
      done: 2,
      total: TEST_PLAN_TASK_TOTAL,
    });
  });

  it("returns non-practice entry for group class days", async () => {
    setupScheduleData({ "2026-04-11": "group-class" });
    const { getMonthProgress } = await loadActions();
    const result = await getMonthProgress("2026-04");
    expect(result["2026-04-11"]).toEqual({ type: "non-practice", dayTypeId: "group-class" });
  });

  it("returns non-practice entry for individual class days", async () => {
    setupScheduleData({ "2026-04-09": "individual-class" });
    const { getMonthProgress } = await loadActions();
    const result = await getMonthProgress("2026-04");
    expect(result["2026-04-09"]).toEqual({ type: "non-practice", dayTypeId: "individual-class" });
  });

  it("returns non-practice entry for sick days", async () => {
    setupScheduleData({ "2026-04-20": "sick" });
    const { getMonthProgress } = await loadActions();
    const result = await getMonthProgress("2026-04");
    expect(result["2026-04-20"]).toEqual({ type: "non-practice", dayTypeId: "sick" });
  });

  it("omits days with no schedule entry", async () => {
    setupScheduleData({ "2026-04-10": "1" });
    const { getMonthProgress } = await loadActions();
    const result = await getMonthProgress("2026-04");
    expect(result["2026-04-15"]).toBeUndefined();
  });

  it("returns empty object for a month with no scheduled days", async () => {
    setupScheduleData({ "2026-04-10": "1" });
    const { getMonthProgress } = await loadActions();
    const result = await getMonthProgress("2025-01");
    expect(result).toEqual({});
  });

  it("treats class days as practice days for linked accounts when a past practice plan exists", async () => {
    setupStudentsData([PRIMARY, LINKED]);
    setupScheduleData({ "2026-04-10": "1", "2026-04-13": "individual-class" });
    setupPlansData(TEST_PLANS);
    writeFileSync(
      tempFile,
      JSON.stringify({
        [`2026-04-13:${LINKED.id}`]: ["demo-a-playWithTrack-0"],
      }),
    );
    cookieState.value = LINKED.id;
    const { getMonthProgress } = await loadActions();
    const result = await getMonthProgress("2026-04");
    expect(result["2026-04-13"]).toEqual({ type: "practice", done: 1, total: TEST_PLAN_TASK_TOTAL });
  });

  it("still marks class days non-practice for primary accounts", async () => {
    setupScheduleData({ "2026-04-10": "1", "2026-04-13": "individual-class" });
    const { getMonthProgress } = await loadActions();
    const result = await getMonthProgress("2026-04");
    expect(result["2026-04-13"]).toEqual({ type: "non-practice", dayTypeId: "individual-class" });
  });

  it("still marks sick days non-practice for linked accounts", async () => {
    setupStudentsData([PRIMARY, LINKED]);
    setupScheduleData({ "2026-04-10": "1", "2026-04-20": "sick" });
    cookieState.value = LINKED.id;
    const { getMonthProgress } = await loadActions();
    const result = await getMonthProgress("2026-04");
    expect(result["2026-04-20"]).toEqual({ type: "non-practice", dayTypeId: "sick" });
  });

  it("falls back to non-practice on class days for linked accounts when no past practice plan exists", async () => {
    setupStudentsData([PRIMARY, LINKED]);
    setupScheduleData({ "2026-04-09": "individual-class" });
    cookieState.value = LINKED.id;
    const { getMonthProgress } = await loadActions();
    const result = await getMonthProgress("2026-04");
    expect(result["2026-04-09"]).toEqual({ type: "non-practice", dayTypeId: "individual-class" });
  });
});

describe("getPlans — seed on first read", () => {
  it("reads from data/plans.json in no-Redis mode", async () => {
    const { getPlans } = await loadActions();
    const plans = await getPlans();
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0].id).toBe("0");
  });
});

describe("getSchedule — seed on first read", () => {
  it("reads the schedule from the configured JSON path", async () => {
    setupScheduleData({ "2026-04-10": "0" });
    const { getSchedule } = await loadActions();
    const schedule = await getSchedule();
    expect(schedule["2026-04-10"]).toBe("0");
  });
});

describe("getSchedule auto-fills today from the last used plan", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // todayLocal() formats in America/New_York; 15:00Z in May = 11 AM EDT
    // = the date 2026-05-23 in NY.
    vi.setSystemTime(new Date("2026-05-23T15:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fills today's entry with the most recent prior plan ID", async () => {
    setupScheduleData({
      "2026-05-20": "3",
      "2026-05-21": "individual-class",
      "2026-05-22": "3",
    });
    const { getSchedule } = await loadActions();
    const schedule = await getSchedule();
    expect(schedule["2026-05-23"]).toBe("3");
    const persisted = JSON.parse(readFileSync(scheduleFile, "utf-8"));
    expect(persisted["2026-05-23"]).toBe("3");
  });

  it("skips class days and sick days when finding the most recent plan", async () => {
    setupScheduleData({
      "2026-05-18": "2",
      "2026-05-19": "sick",
      "2026-05-20": "group-class",
      "2026-05-21": "individual-class",
    });
    const { getSchedule } = await loadActions();
    const schedule = await getSchedule();
    expect(schedule["2026-05-23"]).toBe("2");
  });

  it("leaves the schedule unchanged when today's entry already exists", async () => {
    setupScheduleData({
      "2026-05-22": "5",
      "2026-05-23": "individual-class",
    });
    const { getSchedule } = await loadActions();
    const schedule = await getSchedule();
    expect(schedule["2026-05-23"]).toBe("individual-class");
  });

  it("does nothing when no prior plan-ID entry exists", async () => {
    setupScheduleData({
      "2026-05-20": "sick",
      "2026-05-22": "individual-class",
    });
    const { getSchedule } = await loadActions();
    const schedule = await getSchedule();
    expect(schedule["2026-05-23"]).toBeUndefined();
  });

  it("does nothing when the schedule is empty", async () => {
    setupScheduleData({});
    const { getSchedule } = await loadActions();
    const schedule = await getSchedule();
    expect(schedule["2026-05-23"]).toBeUndefined();
  });
});

describe("getTracks — seed on first read", () => {
  it("reads from data/tracks.json in no-Redis mode", async () => {
    const { getTracks } = await loadActions();
    const tracks = await getTracks();
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks[0].id).toBeTruthy();
  });
});

describe("addTrack + getTrackBlobUrl", () => {
  it("appends a new video track and stores its Blob URL", async () => {
    setupTracksData([
      { id: "scale", name: "Scale", type: "audio", file: "/audio/scale.mp3" },
    ]);
    setupTrackBlobsData({});
    const { addTrack, getTracks, getTrackBlobUrl } = await loadActions();

    await addTrack(
      {
        id: "may-song-bread",
        name: "May Song - Bread",
        type: "video",
        file: "/api/v/may-song-bread",
      },
      "https://blob.example/may-song-bread.mp4",
    );

    const tracks = await getTracks();
    expect(tracks.map((t) => t.id)).toEqual(["scale", "may-song-bread"]);
    const newTrack = tracks.find((t) => t.id === "may-song-bread");
    expect(newTrack?.file).toBe("/api/v/may-song-bread");
    expect(newTrack).not.toHaveProperty("blobUrl");

    const blobUrl = await getTrackBlobUrl("may-song-bread");
    expect(blobUrl).toBe("https://blob.example/may-song-bread.mp4");
  });

  it("returns null for an unknown track id", async () => {
    setupTrackBlobsData({});
    const { getTrackBlobUrl } = await loadActions();
    expect(await getTrackBlobUrl("does-not-exist")).toBeNull();
  });
});

describe("savePlan — inline reference tracks", () => {
  it("persists new reference tracks to the catalog alongside the plan", async () => {
    setupScheduleData({});
    setupPlansData([
      { id: "0", createdDate: "2026-04-10", items: [], checklist: [] },
    ]);
    setupTracksData([
      { id: "scale", name: "Scale", type: "audio", file: "/audio/scale.mp3" },
    ]);
    const blobsFile = setupTrackBlobsData({ scale: "https://blob.example/scale.mp3" });
    const { savePlan, getTracks, getPlans } = await loadActions();

    await savePlan(
      {
        id: "0",
        createdDate: "2026-04-10",
        description: "with custom practice",
        items: [{ trackId: "a-major-scale", tasks: [], dice: false }],
        checklist: [],
      },
      [{ id: "a-major-scale", name: "A Major Scale", type: "reference", file: null }],
    );

    expect((await getTracks()).find((t) => t.id === "a-major-scale")).toEqual({
      id: "a-major-scale",
      name: "A Major Scale",
      type: "reference",
      file: null,
    });
    expect((await getPlans())[0].items[0].trackId).toBe("a-major-scale");
    // Media-less => no blob entry written.
    expect(JSON.parse(readFileSync(blobsFile, "utf-8"))).toEqual({
      scale: "https://blob.example/scale.mp3",
    });
  });

  it("skips reference tracks whose id already exists (idempotent re-save)", async () => {
    setupScheduleData({});
    setupPlansData([
      { id: "0", createdDate: "2026-04-10", items: [], checklist: [] },
    ]);
    setupTracksData([
      { id: "a-major-scale", name: "A Major Scale", type: "reference", file: null },
    ]);
    setupTrackBlobsData({});
    const { savePlan, getTracks } = await loadActions();

    await savePlan(
      { id: "0", createdDate: "2026-04-10", items: [], checklist: [] },
      [{ id: "a-major-scale", name: "A Major Scale", type: "reference", file: null }],
    );

    expect((await getTracks()).filter((t) => t.id === "a-major-scale")).toHaveLength(1);
  });

  it("writes no tracks when the plan is frozen", async () => {
    setupScheduleData({ "2020-01-01": "0" });
    // A past date mapped to the plan that was ACTUALLY practiced => frozen.
    writeFileSync(tempFile, JSON.stringify({ "2020-01-01": ["scale-sing-0"] }));
    setupPlansData([
      { id: "0", createdDate: "2020-01-01", items: [], checklist: [] },
    ]);
    const tracksFile = setupTracksData([
      { id: "scale", name: "Scale", type: "audio", file: "/audio/scale.mp3" },
    ]);
    const { savePlan } = await loadActions();

    await expect(
      savePlan(
        { id: "0", createdDate: "2020-01-01", items: [], checklist: [] },
        [{ id: "a-major-scale", name: "A Major Scale", type: "reference", file: null }],
      ),
    ).rejects.toThrow(/frozen|past/i);

    expect(JSON.parse(readFileSync(tracksFile, "utf-8")).map((t: { id: string }) => t.id)).toEqual([
      "scale",
    ]);
  });
});

describe("savePlan", () => {
  it("updates an existing plan when no past dates map to it", async () => {
    setupScheduleData({});
    setupPlansData([
      { id: "0", createdDate: "2026-04-10", items: [], checklist: [] },
    ]);
    const { savePlan, getPlans } = await loadActions();

    await savePlan({
      id: "0",
      createdDate: "2026-04-10",
      description: "Updated",
      items: [],
      checklist: [],
    });

    const plans = await getPlans();
    expect(plans[0].description).toBe("Updated");
  });

  it("rejects when a past date mapped to the plan was actually practiced", async () => {
    setupScheduleData({ "2020-01-01": "0" });
    writeFileSync(tempFile, JSON.stringify({ "2020-01-01": ["scale-sing-0"] }));
    setupPlansData([
      { id: "0", createdDate: "2020-01-01", items: [], checklist: [] },
    ]);
    const { savePlan } = await loadActions();

    await expect(
      savePlan({
        id: "0",
        createdDate: "2020-01-01",
        description: "Try to edit",
        items: [],
        checklist: [],
      }),
    ).rejects.toThrow(/frozen|past/i);
  });

  it("allows saving when a past date maps to the plan but it was never practiced", async () => {
    setupScheduleData({ "2020-01-01": "0" });
    // Empty practice log => the past-dated demo plan stays editable.
    setupPlansData([
      { id: "0", createdDate: "2020-01-01", items: [], checklist: [] },
    ]);
    const { savePlan, getPlans } = await loadActions();

    await savePlan({
      id: "0",
      createdDate: "2020-01-01",
      description: "Edited template",
      items: [],
      checklist: [],
    });

    expect((await getPlans())[0].description).toBe("Edited template");
  });
});

describe("isPlanFrozen", () => {
  it("is not frozen when a past-dated plan was never practiced", async () => {
    setupScheduleData({ "2020-01-06": "0", "2020-01-07": "individual-class" });
    const { isPlanFrozen } = await loadActions();
    expect(await isPlanFrozen("0")).toBe(false);
  });

  it("is frozen when a past-dated plan was actually practiced", async () => {
    setupScheduleData({ "2020-01-06": "0" });
    writeFileSync(tempFile, JSON.stringify({ "2020-01-06": ["demo-a-playWithTrack-0"] }));
    const { isPlanFrozen } = await loadActions();
    expect(await isPlanFrozen("0")).toBe(true);
  });

  it("is frozen when a past-dated plan has a note but no completed tasks", async () => {
    setupScheduleData({ "2020-01-06": "0" });
    writeFileSync(notesFile, JSON.stringify({ "2020-01-06": { "demo-song": "keep working on it" } }));
    const { isPlanFrozen } = await loadActions();
    expect(await isPlanFrozen("0")).toBe(true);
  });

  it("is not frozen when the plan has no past schedule entry", async () => {
    setupScheduleData({ "2099-01-01": "0" });
    const { isPlanFrozen } = await loadActions();
    expect(await isPlanFrozen("0")).toBe(false);
  });
});

describe("setDayType", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // todayLocal() formats in America/New_York; 15:00Z in June = 11 AM EDT
    // = 2026-06-15 in NY.
    vi.setSystemTime(new Date("2026-06-15T15:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels a future date with a day type", async () => {
    setupScheduleData({});
    const { setDayType, getSchedule } = await loadActions();
    await setDayType("2026-06-20", "sick");
    expect((await getSchedule())["2026-06-20"]).toBe("sick");
  });

  it("labels today", async () => {
    setupScheduleData({});
    const { setDayType, getSchedule } = await loadActions();
    await setDayType("2026-06-15", "individual-class");
    expect((await getSchedule())["2026-06-15"]).toBe("individual-class");
  });

  it("clears a labeled date by deleting its entry", async () => {
    setupScheduleData({ "2026-06-20": "sick" });
    const { setDayType, getSchedule } = await loadActions();
    await setDayType("2026-06-20", null);
    expect((await getSchedule())["2026-06-20"]).toBeUndefined();
  });

  it("rejects a past date", async () => {
    setupScheduleData({});
    const { setDayType } = await loadActions();
    await expect(setDayType("2026-06-01", "sick")).rejects.toThrow(/past/i);
  });

  it("rejects an unknown day-type id", async () => {
    setupScheduleData({});
    const { setDayType } = await loadActions();
    await expect(setDayType("2026-06-20", "holiday")).rejects.toThrow(/day type/i);
  });
});

describe("createPlan — schedule activation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("appends a new plan with the next integer id and anchors it at activeFrom", async () => {
    setupPlansData([
      { id: "0", createdDate: "2026-04-07", items: [], checklist: [] },
    ]);
    setupScheduleData({});
    const { createPlan, getPlans, getSchedule } = await loadActions();

    const { id } = await createPlan(
      { id: "ignored", createdDate: "2026-04-14", items: [], checklist: [] },
      "2026-04-14",
    );

    expect(id).toBe("1");
    expect((await getPlans()).map((p) => p.id)).toEqual(["0", "1"]);
    expect((await getSchedule())["2026-04-14"]).toBe("1");
  });

  it("anchors at activeFrom and remaps later practice dates, preserving class days, earlier and past dates", async () => {
    setupPlansData([
      { id: "0", createdDate: "2026-04-07", items: [], checklist: [] },
    ]);
    setupScheduleData({
      "2026-04-13": "0",
      "2026-04-14": "individual-class",
      "2026-04-15": "0",
      "2026-04-16": "individual-class",
      "2026-04-17": "0",
    });
    const { createPlan, getSchedule } = await loadActions();

    await createPlan(
      { id: "ignored", createdDate: "2026-04-14", items: [], checklist: [] },
      "2026-04-15",
    );

    const schedule = await getSchedule();
    expect(schedule["2026-04-13"]).toBe("0");
    expect(schedule["2026-04-14"]).toBe("individual-class");
    expect(schedule["2026-04-15"]).toBe("1");
    expect(schedule["2026-04-16"]).toBe("individual-class");
    expect(schedule["2026-04-17"]).toBe("1");
  });

  it("snaps a non-practice activeFrom forward to the next practice day", async () => {
    setupPlansData([
      { id: "0", createdDate: "2026-04-07", items: [], checklist: [] },
    ]);
    setupScheduleData({
      "2026-04-14": "individual-class",
      "2026-04-15": "0",
    });
    const { createPlan, getSchedule } = await loadActions();

    await createPlan(
      { id: "ignored", createdDate: "2026-04-14", items: [], checklist: [] },
      "2026-04-14",
    );

    const schedule = await getSchedule();
    expect(schedule["2026-04-14"]).toBe("individual-class");
    expect(schedule["2026-04-15"]).toBe("1");
  });

  it("clamps a past activeFrom up to today", async () => {
    setupPlansData([
      { id: "0", createdDate: "2026-04-07", items: [], checklist: [] },
    ]);
    setupScheduleData({ "2026-04-10": "0" });
    const { createPlan, getSchedule } = await loadActions();

    await createPlan(
      { id: "ignored", createdDate: "2026-04-14", items: [], checklist: [] },
      "2026-04-01",
    );

    const schedule = await getSchedule();
    expect(schedule["2026-04-10"]).toBe("0");
    expect(schedule["2026-04-14"]).toBe("1");
  });
});

describe("getDoneTasks — lazy log-key migration", () => {
  it("migrates legacy unindexed keys to indexed form on first read", async () => {
    const data = { "2026-04-09": ["scale-sing", "scale-playWithTrack-0"] };
    writeFileSync(tempFile, JSON.stringify(data));
    const { getDoneTasks } = await loadActions();

    const result = await getDoneTasks("2026-04-09", PRIMARY);

    expect(result).toEqual(["scale-sing-0", "scale-playWithTrack-0"]);
    const persisted = JSON.parse(readFileSync(tempFile, "utf-8"));
    expect(persisted["2026-04-09"]).toEqual([
      "scale-sing-0",
      "scale-playWithTrack-0",
    ]);
  });

  it("leaves already-indexed keys untouched and does not rewrite the file", async () => {
    const data = { "2026-04-09": ["scale-sing-0", "scale-sing-1"] };
    writeFileSync(tempFile, JSON.stringify(data));
    const statBefore = statSync(tempFile).mtimeMs;
    await new Promise((r) => setTimeout(r, 10));
    const { getDoneTasks } = await loadActions();

    const result = await getDoneTasks("2026-04-09", PRIMARY);

    expect(result).toEqual(["scale-sing-0", "scale-sing-1"]);
    const statAfter = statSync(tempFile).mtimeMs;
    expect(statAfter).toBe(statBefore);
  });
});

describe("notes store", () => {
  it("getNotesForDate returns {} for a date with no notes", async () => {
    const { getNotesForDate } = await loadActions();
    expect(await getNotesForDate("2026-05-01")).toEqual({});
  });

  it("saveTrackNote adds, updates, and deletes a note", async () => {
    const { saveTrackNote, getNotesForDate } = await loadActions();

    await saveTrackNote("2026-05-01", "twinkle", "much better today");
    expect(await getNotesForDate("2026-05-01")).toEqual({
      twinkle: "much better today",
    });

    await saveTrackNote("2026-05-01", "twinkle", "still slipping on C");
    expect(await getNotesForDate("2026-05-01")).toEqual({
      twinkle: "still slipping on C",
    });

    await saveTrackNote("2026-05-01", "twinkle", "");
    expect(await getNotesForDate("2026-05-01")).toEqual({});
  });

  it("saveTrackNote treats whitespace-only as deletion and trims stored value", async () => {
    const { saveTrackNote, getNotesForDate } = await loadActions();

    await saveTrackNote("2026-05-01", "scale", "  spaced  ");
    expect(await getNotesForDate("2026-05-01")).toEqual({ scale: "spaced" });

    await saveTrackNote("2026-05-01", "scale", "   ");
    expect(await getNotesForDate("2026-05-01")).toEqual({});
  });

  it("getNotesInRange spans empty, single, and multi-day ranges and skips empty dates", async () => {
    const { saveTrackNote, getNotesInRange } = await loadActions();

    expect(await getNotesInRange("2026-05-01", "2026-05-03")).toEqual({});

    await saveTrackNote("2026-05-02", "twinkle", "good");
    expect(await getNotesInRange("2026-05-02", "2026-05-02")).toEqual({
      "2026-05-02": { twinkle: "good" },
    });

    await saveTrackNote("2026-05-04", "scale", "ok");
    expect(await getNotesInRange("2026-05-01", "2026-05-05")).toEqual({
      "2026-05-02": { twinkle: "good" },
      "2026-05-04": { scale: "ok" },
    });
  });
});

describe("per-user done-log", () => {
  it("getDoneTasks reads the primary's plain date key", async () => {
    writeFileSync(tempFile, JSON.stringify({ "2026-05-22": ["t-sing-0"] }));
    const { getDoneTasks } = await loadActions();
    expect(await getDoneTasks("2026-05-22", PRIMARY)).toEqual(["t-sing-0"]);
  });

  it("getDoneTasks reads a linked student's composite key", async () => {
    writeFileSync(tempFile, JSON.stringify({ [`2026-05-22:${LINKED.id}`]: ["t-sing-0"] }));
    const { getDoneTasks } = await loadActions();
    expect(await getDoneTasks("2026-05-22", LINKED)).toEqual(["t-sing-0"]);
  });

  it("keeps the primary and linked logs isolated", async () => {
    writeFileSync(
      tempFile,
      JSON.stringify({
        "2026-05-22": ["primary-task-0"],
        [`2026-05-22:${LINKED.id}`]: ["linked-task-0"],
      }),
    );
    const { getDoneTasks } = await loadActions();
    expect(await getDoneTasks("2026-05-22", PRIMARY)).toEqual(["primary-task-0"]);
    expect(await getDoneTasks("2026-05-22", LINKED)).toEqual(["linked-task-0"]);
  });

  it("toggleTask as a linked user writes to the composite key only", async () => {
    setupStudentsData([PRIMARY, LINKED]);
    cookieState.value = LINKED.id;
    const { toggleTask } = await loadActions();
    await toggleTask("2026-05-22", "t-sing-0");
    const log = JSON.parse(readFileSync(tempFile, "utf-8"));
    expect(log[`2026-05-22:${LINKED.id}`]).toEqual(["t-sing-0"]);
    expect(log["2026-05-22"]).toBeUndefined();
  });
});

describe("getActiveStudent", () => {
  it("returns the cookie's student when the id is valid", async () => {
    setupStudentsData([PRIMARY, LINKED]);
    cookieState.value = LINKED.id;
    const { getActiveStudent } = await loadActions();
    expect((await getActiveStudent()).id).toBe(LINKED.id);
  });

  it("falls back to the primary when the cookie is missing", async () => {
    cookieState.value = undefined;
    const { getActiveStudent } = await loadActions();
    expect((await getActiveStudent()).id).toBe(PRIMARY.id);
  });

  it("falls back to the primary when the cookie id is unknown", async () => {
    cookieState.value = "nobody";
    const { getActiveStudent } = await loadActions();
    expect((await getActiveStudent()).id).toBe(PRIMARY.id);
  });
});

describe("getStudents / getTeacher", () => {
  it("getStudents reads the single-student roster from the seed (no Redis)", async () => {
    const { getStudents } = await loadActions();
    // The public template ships a primary student only; linked accounts are
    // opt-in via Redis (#37), so LINKED is not in the committed seed.
    expect((await getStudents()).map((s) => s.id)).toEqual([PRIMARY.id]);
  });
  it("getTeacher reads the teacher from the seed (no Redis)", async () => {
    const { getTeacher } = await loadActions();
    expect((await getTeacher()).name).toBe(TEST_TEACHER.name);
  });
});
