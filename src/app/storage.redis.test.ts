import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeRedis } from "./test-support/fake-redis";

vi.mock("@upstash/redis", async () => ({
  Redis: (await import("./test-support/fake-redis")).FakeRedis,
}));

const file = { path: "/nonexistent/never-read.json" };

beforeEach(() => {
  vi.resetModules();
  FakeRedis.reset();
  process.env.KV_REST_API_URL = "fake";
  process.env.KV_REST_API_TOKEN = "fake";
});

describe("hash helpers (Redis path)", () => {
  it("returns {} for a hash Redis reports as null", async () => {
    const { hashGetAll, stringCodec } = await import("./storage");
    expect(await hashGetAll("h", file, stringCodec)).toEqual({});
  });

  it('a value of "0" round-trips as the string "0"', async () => {
    const { hashSet, hashGet, hashGetAll, stringCodec } = await import("./storage");
    await hashSet("schedule:day", file, stringCodec, "2020-01-06", "0");
    const one = await hashGet("schedule:day", file, stringCodec, "2020-01-06");
    expect(one).toBe("0");
    expect(typeof one).toBe("string");
    expect(await hashGetAll("schedule:day", file, stringCodec)).toEqual({ "2020-01-06": "0" });
  });

  it("an object value round-trips through jsonCodec and is stored as a string", async () => {
    const { hashSet, hashGet, jsonCodec } = await import("./storage");
    const codec = jsonCodec<{ id: string; n: number }>();
    await hashSet("track:all", file, codec, "a", { id: "a", n: 1 });
    expect(await hashGet("track:all", file, codec, "a")).toEqual({ id: "a", n: 1 });
    const raw = FakeRedis.dump()["track:all"] as Record<string, unknown>;
    expect(typeof raw.a).toBe("string");
  });

  it("hashSetIfAbsent returns false when the field exists", async () => {
    const { hashSet, hashSetIfAbsent, hashGet, stringCodec } = await import("./storage");
    await hashSet("h", file, stringCodec, "a", "old");
    expect(await hashSetIfAbsent("h", file, stringCodec, "a", "new")).toBe(false);
    expect(await hashSetIfAbsent("h", file, stringCodec, "b", "fresh")).toBe(true);
    expect(await hashGet("h", file, stringCodec, "a")).toBe("old");
  });

  it("hashSeedIfEmpty writes the seed only when the hash is empty", async () => {
    const { hashSeedIfEmpty, stringCodec } = await import("./storage");
    expect(await hashSeedIfEmpty("h", file, stringCodec, { a: "1" })).toEqual({ a: "1" });
    expect(await hashSeedIfEmpty("h", file, stringCodec, { b: "2" })).toEqual({ a: "1" });
  });

  it("hashDelete removes the field", async () => {
    const { hashSet, hashDelete, hashGetAll, stringCodec } = await import("./storage");
    await hashSet("h", file, stringCodec, "a", "1");
    await hashSet("h", file, stringCodec, "b", "2");
    await hashDelete("h", file, "a");
    expect(await hashGetAll("h", file, stringCodec)).toEqual({ b: "2" });
  });
});

describe("set helpers (Redis path)", () => {
  it("setAdd returns true then false for the same member; setRemove drops it", async () => {
    const { setAdd, setRemove, setMembers } = await import("./storage");
    expect(await setAdd("done:d", file, "a-sing-0")).toBe(true);
    expect(await setAdd("done:d", file, "a-sing-0")).toBe(false);
    expect(await setMembers("done:d", file)).toEqual(["a-sing-0"]);
    await setRemove("done:d", file, "a-sing-0");
    expect(await setMembers("done:d", file)).toEqual([]);
  });
});

describe("nextId (Redis path)", () => {
  it("increments the counter and never calls the fallback", async () => {
    const { nextId } = await import("./storage");
    const fallback = vi.fn(async () => 99);
    expect(await nextId("plan:next-id", fallback)).toBe(1);
    expect(await nextId("plan:next-id", fallback)).toBe(2);
    expect(fallback).not.toHaveBeenCalled();
  });
});
