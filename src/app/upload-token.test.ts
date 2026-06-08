import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("verifyUploadToken", () => {
  beforeEach(() => {
    vi.stubEnv("UPLOAD_TOKEN", "secret-abc-123");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the correct bearer token", async () => {
    const { verifyUploadToken } = await import("./upload-token");
    expect(verifyUploadToken("Bearer secret-abc-123")).toBe(true);
  });

  it("rejects a missing Authorization header", async () => {
    const { verifyUploadToken } = await import("./upload-token");
    expect(verifyUploadToken(null)).toBe(false);
    expect(verifyUploadToken("")).toBe(false);
  });

  it("rejects a non-Bearer scheme", async () => {
    const { verifyUploadToken } = await import("./upload-token");
    expect(verifyUploadToken("Basic secret-abc-123")).toBe(false);
  });

  it("rejects a wrong token of the same length", async () => {
    const { verifyUploadToken } = await import("./upload-token");
    expect(verifyUploadToken("Bearer wrong-bcd-456")).toBe(false);
  });

  it("rejects a token of a different length", async () => {
    const { verifyUploadToken } = await import("./upload-token");
    expect(verifyUploadToken("Bearer short")).toBe(false);
  });

  it("throws if UPLOAD_TOKEN env var is missing", async () => {
    vi.unstubAllEnvs();
    const { verifyUploadToken } = await import("./upload-token");
    expect(() => verifyUploadToken("Bearer anything")).toThrow(/UPLOAD_TOKEN/);
  });
});
