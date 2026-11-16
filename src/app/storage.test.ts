import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let dir: string;
let path: string;

beforeEach(() => {
  // Fresh module per test: storage.ts decides Redis-or-file at import time.
  vi.resetModules();
  delete process.env.KV_REST_API_URL;
  dir = mkdtempSync(join(tmpdir(), "storage-test-"));
  path = join(dir, "store.json");
  writeFileSync(path, JSON.stringify({}));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const fileJson = () => JSON.parse(readFileSync(path, "utf-8"));

describe("hash helpers (file fallback)", () => {
  it("returns {} when the file holds {}", async () => {
    const { hashGetAll, stringCodec } = await import("./storage");
    expect(await hashGetAll("k", { path }, stringCodec)).toEqual({});
  });

  it("stores a string value under its field", async () => {
    const { hashSet, hashGetAll, stringCodec } = await import("./storage");
    await hashSet("k", { path }, stringCodec, "a", "x");
    expect(await hashGetAll("k", { path }, stringCodec)).toEqual({ a: "x" });
  });

  it("stores an object value as an object in the file", async () => {
    const { hashSet, hashGet, jsonCodec } = await import("./storage");
    const codec = jsonCodec<{ id: string }>();
    await hashSet("k", { path }, codec, "a", { id: "a" });
    expect(fileJson()).toEqual({ a: { id: "a" } });
    expect(await hashGet("k", { path }, codec, "a")).toEqual({ id: "a" });
    expect(await hashGet("k", { path }, codec, "zzz")).toBeNull();
  });

  it("returns false and keeps the old value when the field exists", async () => {
    const { hashSet, hashSetIfAbsent, hashGetAll, stringCodec } = await import("./storage");
    await hashSet("k", { path }, stringCodec, "a", "old");
    expect(await hashSetIfAbsent("k", { path }, stringCodec, "a", "new")).toBe(false);
    expect(await hashSetIfAbsent("k", { path }, stringCodec, "b", "fresh")).toBe(true);
    expect(await hashGetAll("k", { path }, stringCodec)).toEqual({ a: "old", b: "fresh" });
  });

  it("removes only that field", async () => {
    const { hashSet, hashDelete, hashGetAll, stringCodec } = await import("./storage");
    await hashSet("k", { path }, stringCodec, "a", "1");
    await hashSet("k", { path }, stringCodec, "b", "2");
    await hashDelete("k", { path }, "a");
    expect(await hashGetAll("k", { path }, stringCodec)).toEqual({ b: "2" });
  });

  it("returns the file contents and ignores the seed in dev", async () => {
    writeFileSync(path, JSON.stringify({ a: "from-file" }));
    const { hashSeedIfEmpty, stringCodec } = await import("./storage");
    expect(await hashSeedIfEmpty("k", { path }, stringCodec, { s: "seed" })).toEqual({
      a: "from-file",
    });
  });

  it("treats a field named like an Object built-in as absent on an empty store", async () => {
    const { hashGet, hashSetIfAbsent, hashGetAll, stringCodec } = await import("./storage");
    expect(await hashGet("k", { path }, stringCodec, "constructor")).toBeNull();
    expect(await hashSetIfAbsent("k", { path }, stringCodec, "constructor", "x")).toBe(true);
    expect(await hashGetAll("k", { path }, stringCodec)).toEqual({ constructor: "x" });
  });

  it("writes under the slot and leaves other slots alone", async () => {
    writeFileSync(path, JSON.stringify({ "2025-12-31": { t: "old" } }));
    const { hashSet, hashGetAll, stringCodec } = await import("./storage");
    await hashSet("k", { path, slot: "2026-01-01" }, stringCodec, "t", "new");
    expect(fileJson()).toEqual({ "2025-12-31": { t: "old" }, "2026-01-01": { t: "new" } });
    expect(await hashGetAll("k", { path, slot: "2026-01-01" }, stringCodec)).toEqual({ t: "new" });
    expect(await hashGetAll("k", { path, slot: "2026-01-02" }, stringCodec)).toEqual({});
  });
});

describe("set helpers (file fallback)", () => {
  it("returns true for a new member and false for a repeat", async () => {
    const { setAdd, setMembers } = await import("./storage");
    writeFileSync(path, JSON.stringify([]));
    expect(await setAdd("k", { path }, "a")).toBe(true);
    expect(await setAdd("k", { path }, "a")).toBe(false);
    expect(await setAdd("k", { path }, "b")).toBe(true);
    expect((await setMembers("k", { path })).sort()).toEqual(["a", "b"]);
  });

  it("removes an emptied slot from the file", async () => {
    const { setAdd, setRemove, setMembers } = await import("./storage");
    const file = { path, slot: "2026-01-01" };
    await setAdd("k", file, "a");
    expect(fileJson()).toEqual({ "2026-01-01": ["a"] });
    await setRemove("k", file, "a");
    expect(fileJson()).toEqual({});
    expect(await setMembers("k", file)).toEqual([]);
  });
});

describe("nextId (file fallback)", () => {
  it("uses the fallback in dev", async () => {
    const { nextId } = await import("./storage");
    expect(await nextId("counter", async () => 7)).toBe(7);
  });
});
