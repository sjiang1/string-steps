import { describe, it, expect } from "vitest";
import {
  normalizeTapKeys,
  entriesById,
  maxNumericId,
  KEY_MAP,
  newPracticeKey,
  newNotesKey,
} from "./storage-migration.mjs";

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
