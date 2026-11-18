import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { Track } from "./plans";

let dir: string;
let file: string;

const scale: Track = { id: "scale", name: "A Major Scale", type: "reference", file: null };
const song: Track = { id: "song", name: "Song", type: "audio", file: "/api/v/song" };

beforeEach(() => {
  // Fresh module per test: storage.ts decides Redis-or-file at import time.
  vi.resetModules();
  delete process.env.KV_REST_API_URL;
  dir = mkdtempSync(join(tmpdir(), "tracks-test-"));
  file = join(dir, "tracks.json");
  writeFileSync(file, JSON.stringify({ scale }));
  process.env.TRACKS_JSON_PATH = file;
});

afterEach(() => {
  delete process.env.TRACKS_JSON_PATH;
  rmSync(dir, { recursive: true, force: true });
});

describe("track catalog store", () => {
  it("getTracks returns the file's tracks as an array", async () => {
    const { getTracks } = await import("./tracks");
    expect(await getTracks()).toEqual([scale]);
  });

  it("addTracks skips ids that already exist and returns only the new ones", async () => {
    const { addTracks, getTracks } = await import("./tracks");
    const renamed: Track = { ...scale, name: "Renamed" };
    expect(await addTracks([renamed, song])).toEqual([song]);
    const all = await getTracks();
    expect(all.find((t) => t.id === "scale")?.name).toBe("A Major Scale");
    expect(all.map((t) => t.id).sort()).toEqual(["scale", "song"]);
    expect(Object.keys(JSON.parse(readFileSync(file, "utf-8"))).sort()).toEqual(["scale", "song"]);
  });
});
