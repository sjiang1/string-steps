import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getTrackBlobUrlMock = vi.fn();

vi.mock("../../../actions", () => ({
  getTrackBlobUrl: getTrackBlobUrlMock,
}));

function makeRequest(): NextRequest {
  return new NextRequest("https://example.com/api/v/may-song-bread");
}

describe("GET /api/v/[id]", () => {
  beforeEach(() => {
    getTrackBlobUrlMock.mockReset();
    vi.resetModules();
  });

  it("returns 404 when the track has no blob url", async () => {
    getTrackBlobUrlMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("302-redirects to the blob url when present", async () => {
    getTrackBlobUrlMock.mockResolvedValueOnce(
      "https://blob.example/tracks/may-song-bread.mp4",
    );
    const { GET } = await import("./route");
    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "may-song-bread" }),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://blob.example/tracks/may-song-bread.mp4",
    );
  });
});
