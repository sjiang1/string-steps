import { describe, it, expect } from "vitest";
import {
  needsMigration,
  contentTypeFor,
  blobPathnameFor,
  proxyPathFor,
} from "./checklist-migration.mjs";

describe("needsMigration", () => {
  it("true for an item with a /images/checklist/ path", () => {
    expect(needsMigration({ id: "x", image: "/images/checklist/x.png" })).toBe(true);
  });
  it("false for an already-migrated /api/img/ path", () => {
    expect(needsMigration({ id: "x", image: "/api/img/x" })).toBe(false);
  });
  it("false when image is missing", () => {
    expect(needsMigration({ id: "x" })).toBe(false);
  });
});

describe("contentTypeFor", () => {
  it("maps .png to image/png", () => expect(contentTypeFor("/images/checklist/x.png")).toBe("image/png"));
  it("maps .jpg to image/jpeg", () => expect(contentTypeFor("/images/checklist/x.jpg")).toBe("image/jpeg"));
  it("maps .jpeg to image/jpeg", () => expect(contentTypeFor("/images/checklist/x.jpeg")).toBe("image/jpeg"));
  it("throws on an unknown extension", () => expect(() => contentTypeFor("/images/checklist/x.gif")).toThrow());
});

describe("blobPathnameFor / proxyPathFor", () => {
  it("puts images under checklist/ keeping the extension", () =>
    expect(blobPathnameFor({ id: "mouse-holes", image: "/images/checklist/mouse-holes.png" })).toBe("checklist/mouse-holes.png"));
  it("lowercases the extension", () =>
    expect(blobPathnameFor({ id: "x", image: "/images/checklist/x.JPG" })).toBe("checklist/x.jpg"));
  it("builds the proxy path from the id", () =>
    expect(proxyPathFor({ id: "mouse-holes" })).toBe("/api/img/mouse-holes"));
});
