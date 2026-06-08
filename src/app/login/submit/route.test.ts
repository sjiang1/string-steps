import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

async function makeRequest(fields: Record<string, string>): Promise<NextRequest> {
  const body = new URLSearchParams(fields).toString();
  return new NextRequest("https://example.com/login/submit", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

describe("POST /login", () => {
  beforeEach(() => {
    vi.stubEnv("APP_PASSCODE", "correct-password");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects to sanitized next and sets cookie on correct password", async () => {
    const { POST } = await import("./route");
    const request = await makeRequest({
      password: "correct-password",
      next: "/plans",
    });
    const response = await POST(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.com/plans");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^ss-auth=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Max-Age=2592000/);
  });

  it("falls back to / when next is an open-redirect attempt", async () => {
    const { POST } = await import("./route");
    const request = await makeRequest({
      password: "correct-password",
      next: "//evil.com",
    });
    const response = await POST(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.com/");
  });

  it("redirects to /login?error=1 on wrong password, no cookie set", async () => {
    const { POST } = await import("./route");
    const request = await makeRequest({
      password: "wrong",
      next: "/plans",
    });
    const response = await POST(request);
    expect(response.status).toBe(303);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login?error=1");
    expect(location).toContain("next=%2Fplans");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("throws when APP_PASSCODE is missing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("APP_PASSCODE", "");
    const { POST } = await import("./route");
    const request = await makeRequest({ password: "anything", next: "/" });
    await expect(POST(request)).rejects.toThrow(/APP_PASSCODE/);
  });
});
