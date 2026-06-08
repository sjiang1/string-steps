import { describe, it, expect } from "vitest";
import {
  computeAuthToken,
  timingSafeEqualString,
  sanitizeNext,
} from "./auth";

describe("computeAuthToken", () => {
  it("is deterministic for the same password", async () => {
    const a = await computeAuthToken("hunter2");
    const b = await computeAuthToken("hunter2");
    expect(a).toBe(b);
  });

  it("produces different tokens for different passwords", async () => {
    const a = await computeAuthToken("hunter2");
    const b = await computeAuthToken("hunter3");
    expect(a).not.toBe(b);
  });

  it("outputs url-safe base64 (no +/= chars)", async () => {
    const token = await computeAuthToken("any-password");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("timingSafeEqualString", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeEqualString("abc", "abc")).toBe(true);
  });

  it("returns false for different strings of equal length", () => {
    expect(timingSafeEqualString("abc", "abd")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(timingSafeEqualString("abc", "abcd")).toBe(false);
  });
});

describe("sanitizeNext", () => {
  it.each([
    ["/", "/"],
    ["/plans", "/plans"],
    ["/plans?foo=bar", "/plans?foo=bar"],
    ["/audio/foo.mp3", "/audio/foo.mp3"],
  ])("accepts safe relative path %s", (input, expected) => {
    expect(sanitizeNext(input)).toBe(expected);
  });

  it.each([
    "//evil.com",
    "//evil.com/path",
    "http://evil.com",
    "https://evil.com/path",
    "javascript:alert(1)",
    "data:text/html,foo",
    "/\\evil",
    "plans",
    "",
  ])("rejects %s and falls back to /", (input) => {
    expect(sanitizeNext(input)).toBe("/");
  });

  it("returns / when input is null", () => {
    expect(sanitizeNext(null)).toBe("/");
  });
});
