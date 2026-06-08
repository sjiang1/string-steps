import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { computeAuthToken } from "./app/auth";

describe("proxy", () => {
  beforeEach(() => {
    vi.stubEnv("APP_PASSCODE", "correct-password");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function runProxy(path: string, cookieValue?: string) {
    const { proxy } = await import("./proxy");
    const headers = new Headers();
    if (cookieValue !== undefined) {
      headers.set("cookie", `ss-auth=${cookieValue}`);
    }
    const request = new NextRequest(`https://example.com${path}`, { headers });
    return proxy(request);
  }

  it("redirects unauthenticated /plans to /login with encoded next", async () => {
    const response = await runProxy("/plans");
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login?next=%2Fplans");
  });

  it("redirects unauthenticated /audio/foo.mp3 to /login", async () => {
    const response = await runProxy("/audio/foo.mp3");
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login?next=%2Faudio%2Ffoo.mp3");
  });

  it("includes query string in next", async () => {
    const response = await runProxy("/plans?foo=bar");
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(decodeURIComponent(location)).toContain("next=/plans?foo=bar");
  });

  it("passes through when cookie matches current APP_PASSCODE", async () => {
    const token = await computeAuthToken("correct-password");
    const response = await runProxy("/plans", token);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects when cookie was signed with a different password", async () => {
    const staleToken = await computeAuthToken("old-password");
    const response = await runProxy("/plans", staleToken);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("redirects when cookie value is garbage", async () => {
    const response = await runProxy("/plans", "not-a-real-token");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});

describe("proxy config", () => {
  it("matcher excludes _next, favicon.ico, login, images, and api/tracks", async () => {
    const { config } = await import("./proxy");
    expect(config.matcher).toEqual([
      "/((?!_next/|favicon.ico|login|images/|api/tracks).*)",
    ]);
  });

  async function matches(path: string): Promise<boolean> {
    const { config } = await import("./proxy");
    // Next.js matcher strings are regular expressions anchored at the start.
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    return pattern.test(path);
  }

  it("excludes /api/tracks paths from the matcher", async () => {
    expect(await matches("/api/tracks")).toBe(false);
    expect(await matches("/api/tracks/upload-url")).toBe(false);
  });

  it("still gates /api/v paths", async () => {
    expect(await matches("/api/v/may-song-bread")).toBe(true);
  });
});
