import { describe, it, expect } from "vitest";
import {
  needsMigration,
  contentTypeFor,
  blobPathnameFor,
  proxyPathFor,
} from "./media-migration.mjs";

describe("needsMigration", () => {
  it("true for audio with a /audio/ path", () => {
    expect(needsMigration({ id: "x", type: "audio", file: "/audio/x.mp3" })).toBe(true);
  });
  it("true for video with a /videos/ path", () => {
    expect(needsMigration({ id: "x", type: "video", file: "/videos/x.mp4" })).toBe(true);
  });
  it("false for a reference track (null file)", () => {
    expect(needsMigration({ id: "x", type: "reference", file: null })).toBe(false);
  });
  it("false for an already-migrated /api/v/ path", () => {
    expect(needsMigration({ id: "x", type: "video", file: "/api/v/x" })).toBe(false);
  });
});

describe("contentTypeFor", () => {
  it("maps .mp3 to audio/mpeg", () => expect(contentTypeFor("/audio/x.mp3")).toBe("audio/mpeg"));
  it("maps .m4a to audio/mp4", () => expect(contentTypeFor("/audio/x.m4a")).toBe("audio/mp4"));
  it("maps .mp4 to video/mp4", () => expect(contentTypeFor("/videos/x.mp4")).toBe("video/mp4"));
  it("throws on an unknown extension", () => expect(() => contentTypeFor("/audio/x.wav")).toThrow());
});

describe("blobPathnameFor / proxyPathFor", () => {
  it("puts audio tracks under audio/ keeping the extension", () =>
    expect(blobPathnameFor({ id: "a-b", type: "audio", file: "/audio/a.m4a" })).toBe("audio/a-b.m4a"));
  it("puts video tracks under videos/ keeping the extension", () =>
    expect(blobPathnameFor({ id: "demo-1", type: "video", file: "/videos/d.mp4" })).toBe("videos/demo-1.mp4"));
  it("builds the proxy path from the id", () =>
    expect(proxyPathFor({ id: "a-b" })).toBe("/api/v/a-b"));
});
