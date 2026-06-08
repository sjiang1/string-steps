import { describe, it, expect } from "vitest";
import { slugify, nextAvailableTrackId } from "./track-id";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("May Song - Bread")).toBe("may-song-bread");
  });

  it("collapses multiple separators into one hyphen", () => {
    expect(slugify("foo  --  bar")).toBe("foo-bar");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("  -hello world-  ")).toBe("hello-world");
  });

  it("preserves digits", () => {
    expect(slugify("Etude No. 5")).toBe("etude-no-5");
  });

  it("returns 'track' for empty or non-alphanumeric input", () => {
    expect(slugify("   ")).toBe("track");
    expect(slugify("---")).toBe("track");
    expect(slugify("")).toBe("track");
  });
});

describe("nextAvailableTrackId", () => {
  it("returns the slug when no collision", () => {
    expect(nextAvailableTrackId("May Song", [])).toBe("may-song");
  });

  it("appends -2 on first collision", () => {
    expect(nextAvailableTrackId("May Song", ["may-song"])).toBe("may-song-2");
  });

  it("appends -3 when -2 is also taken", () => {
    expect(nextAvailableTrackId("May Song", ["may-song", "may-song-2"])).toBe(
      "may-song-3",
    );
  });

  it("does not collide with unrelated existing ids", () => {
    expect(nextAvailableTrackId("Etude", ["may-song", "may-song-2"])).toBe(
      "etude",
    );
  });
});
