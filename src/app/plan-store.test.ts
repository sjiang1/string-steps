import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { Plan } from "./plans";
import { FakeRedis } from "./test-support/fake-redis";

vi.mock("@upstash/redis", async () => ({
  Redis: (await import("./test-support/fake-redis")).FakeRedis,
}));

const plan = (id: string): Plan => ({ id, createdDate: "2026-01-01", items: [], checklist: [] });

let dir: string;
let file: string;

beforeEach(() => {
  // Fresh module per test: storage.ts decides Redis-or-file at import time.
  vi.resetModules();
  FakeRedis.reset();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  dir = mkdtempSync(join(tmpdir(), "plan-store-test-"));
  file = join(dir, "plans.json");
  writeFileSync(file, JSON.stringify({}));
  process.env.PLANS_JSON_PATH = file;
});

afterEach(() => {
  delete process.env.PLANS_JSON_PATH;
  rmSync(dir, { recursive: true, force: true });
});

describe("plan store (file fallback)", () => {
  it("createPlanWithNewId uses max numeric id + 1 in dev", async () => {
    writeFileSync(file, JSON.stringify({ "0": plan("0"), "2": plan("2") }));
    const { createPlanWithNewId, getPlanMap } = await import("./plan-store");
    const created = await createPlanWithNewId({ createdDate: "2026-02-02", items: [], checklist: [] });
    expect(created.id).toBe("3");
    expect(Object.keys(await getPlanMap()).sort()).toEqual(["0", "2", "3"]);
  });

  it("putPlan replaces a plan in place and leaves the others", async () => {
    writeFileSync(file, JSON.stringify({ "0": plan("0"), "1": plan("1") }));
    const { putPlan, getPlanMap } = await import("./plan-store");
    await putPlan({ ...plan("1"), description: "edited" });
    const map = await getPlanMap();
    expect(map["1"].description).toBe("edited");
    expect(map["0"]).toEqual(plan("0"));
    expect(Object.keys(JSON.parse(readFileSync(file, "utf-8"))).sort()).toEqual(["0", "1"]);
  });
});

describe("plan store (Redis path)", () => {
  it("skips an id that already exists", async () => {
    process.env.KV_REST_API_URL = "fake";
    process.env.KV_REST_API_TOKEN = "fake";
    // A plan "1" added by hand, and a counter still at 0.
    const seeded = new FakeRedis();
    await seeded.hset("plan:all", { "1": JSON.stringify(plan("1")) });
    await seeded.set("plan:next-id", "0");

    const { createPlanWithNewId, getPlanMap } = await import("./plan-store");
    const created = await createPlanWithNewId({ createdDate: "2026-02-02", items: [], checklist: [] });
    expect(created.id).toBe("2");
    const map = await getPlanMap();
    expect(map["1"]).toEqual(plan("1"));
    expect(map["2"].createdDate).toBe("2026-02-02");
  });
});
