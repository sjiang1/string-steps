import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import tracks from "@data/tracks.json";
import plans from "@data/plans.json";
import schedule from "@data/plan-schedule.json";
import dayTypes from "@data/day-types.json";
import { mostRecentPastPracticePlanIdAsOf } from "./plans";
import { todayLocal } from "./today";

const trackIds = new Set((tracks as { id: string }[]).map((t) => t.id));
const planIds = new Set((plans as { id: string }[]).map((p) => p.id));
const dayTypeIds = new Set((dayTypes as { id: string }[]).map((d) => d.id));
const scheduleMap = schedule as Record<string, string>;

describe("committed seed data is internally consistent", () => {
  it("every plan item references a track that exists", () => {
    for (const plan of plans as { id: string; items: { trackId: string }[] }[]) {
      for (const item of plan.items) {
        expect(trackIds.has(item.trackId), `plan ${plan.id} item trackId ${item.trackId}`).toBe(true);
      }
    }
  });

  it("every schedule value is a known plan id or day-type id", () => {
    for (const [date, value] of Object.entries(scheduleMap)) {
      expect(planIds.has(value) || dayTypeIds.has(value), `schedule ${date} -> ${value}`).toBe(true);
    }
  });

  it("has a past-dated practice day so a fresh deploy resolves a plan today", () => {
    const fallbackId = mostRecentPastPracticePlanIdAsOf(todayLocal(), scheduleMap);
    expect(fallbackId).not.toBeNull();
    expect(planIds.has(fallbackId as string)).toBe(true);
  });

  it("every track with a /demo/ file points at an existing public asset", () => {
    for (const t of tracks as { type: string; file: string | null }[]) {
      if (t.file && t.file.startsWith("/demo/")) {
        expect(existsSync(join(process.cwd(), "public", t.file)), `missing public${t.file}`).toBe(true);
      }
    }
  });
});
