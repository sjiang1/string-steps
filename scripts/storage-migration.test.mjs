import { describe, it, expect, beforeEach } from "vitest";
import { FakeRedis } from "../src/app/test-support/fake-redis.ts";
import {
  normalizeTapKeys,
  entriesById,
  maxNumericId,
  KEY_MAP,
  newPracticeKey,
  newNotesKey,
  hashReplyToRecord,
  planHash,
  planSet,
} from "./storage-migration.mjs";

describe("hashReplyToRecord", () => {
  it("turns a flat HGETALL reply into a record and [] into {}", () => {
    expect(hashReplyToRecord(["a", "0", "b", '{"x":1}'])).toEqual({ a: "0", b: '{"x":1}' });
    expect(hashReplyToRecord([])).toEqual({});
    expect(hashReplyToRecord(null)).toEqual({});
    expect(hashReplyToRecord({ a: "1" })).toEqual({ a: "1" });
  });
});

describe("planHash / planSet against an already-populated target", () => {
  beforeEach(() => FakeRedis.reset());

  it("counts only fields that are really present and writes the rest", async () => {
    const redis = new FakeRedis();
    await redis.hset("plan:all", { "0": "p0", "1": "p1" });
    const plan = await planHash(redis, "plans:list", "plan:all", { "0": "p0", "1": "p1", "2": "p2", "3": "p3" }, "");
    expect(plan.present).toBe(2);
    expect(plan.write).toBe(2);
    await plan.apply();
    expect(hashReplyToRecord(await redis.hgetall("plan:all"))).toEqual({ "0": "p0", "1": "p1", "2": "p2", "3": "p3" });
    expect(await plan.verify()).toBe(true);
  });

  it("copies a field named constructor into an empty target", async () => {
    const redis = new FakeRedis();
    const plan = await planHash(redis, "notes:d", "note:d", { constructor: "note" }, "");
    expect(plan.present).toBe(0);
    expect(plan.write).toBe(1);
  });

  it("never overwrites a field that already exists", async () => {
    const redis = new FakeRedis();
    await redis.hset("note:d", { t: "newer" });
    const plan = await planHash(redis, "notes:d", "note:d", { t: "older" }, "");
    await plan.apply();
    expect(hashReplyToRecord(await redis.hgetall("note:d"))).toEqual({ t: "newer" });
  });

  it("planSet adds only the missing members", async () => {
    const redis = new FakeRedis();
    await redis.sadd("done:d", "a-sing-0");
    const plan = await planSet(redis, "practice:d", "done:d", ["a-sing-0", "b-sing-0"], "");
    expect(plan.present).toBe(1);
    expect(plan.write).toBe(1);
    await plan.apply();
    expect((await redis.smembers("done:d")).sort()).toEqual(["a-sing-0", "b-sing-0"]);
    expect(await plan.verify()).toBe(true);
  });
});

describe("normalizeTapKeys", () => {
  it("appends -0 to a member without a rep suffix and reports it", () => {
    const { members, normalized } = normalizeTapKeys(["a-sing", "a-sing-0", "b-play-1"]);
    expect(members).toEqual(["a-sing-0", "b-play-1"]);
    expect(normalized).toEqual(["a-sing"]);
  });

  it("leaves already-suffixed unique members alone", () => {
    const { members, normalized } = normalizeTapKeys(["x-playWithTrack:slow-2", "y-sing-0"]);
    expect(members).toEqual(["x-playWithTrack:slow-2", "y-sing-0"]);
    expect(normalized).toEqual([]);
  });
});

describe("entriesById", () => {
  it("keeps the first of two entries with the same id and lists the duplicate", () => {
    const { entries, duplicates } = entriesById([
      { id: "a", name: "first" },
      { id: "b", name: "b" },
      { id: "a", name: "second" },
    ]);
    expect(entries).toEqual({ a: { id: "a", name: "first" }, b: { id: "b", name: "b" } });
    expect(duplicates).toEqual(["a"]);
  });
});

describe("entriesById with built-in-looking ids", () => {
  it("does not treat an id named constructor as a duplicate", () => {
    const { entries, duplicates } = entriesById([{ id: "constructor" }, { id: "toString" }]);
    expect(Object.keys(entries).sort()).toEqual(["constructor", "toString"]);
    expect(duplicates).toEqual([]);
  });
});

describe("maxNumericId", () => {
  it("ignores non-numeric ids and is -1 when none", () => {
    expect(maxNumericId(["0", "12", "abc", "7"])).toBe(12);
    expect(maxNumericId(["abc"])).toBe(-1);
    expect(maxNumericId([])).toBe(-1);
  });
});

describe("key names", () => {
  it("maps every old key name to its new one", () => {
    expect(KEY_MAP).toEqual({
      "tracks:list": "track:all",
      "tracks:blobs": "track:blob",
      "plans:list": "plan:all",
      "schedule:map": "schedule:day",
    });
    expect(newPracticeKey("practice:2026-04-09")).toBe("done:2026-04-09");
    expect(newPracticeKey("practice:2026-04-09:mama")).toBe("done:2026-04-09:mama");
    expect(newNotesKey("notes:2026-04-09")).toBe("note:2026-04-09");
  });
});
