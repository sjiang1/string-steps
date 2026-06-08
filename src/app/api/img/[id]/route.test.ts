import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getChecklistImageBlobUrlMock = vi.fn();

vi.mock("../../../actions", () => ({
  getChecklistImageBlobUrl: getChecklistImageBlobUrlMock,
}));

function makeRequest(): NextRequest {
  return new NextRequest("https://example.com/api/img/mouse-holes");
}

describe("GET /api/img/[id]", () => {
  beforeEach(() => {
    getChecklistImageBlobUrlMock.mockReset();
    vi.resetModules();
  });

  it("returns 404 when the image has no blob url", async () => {
    getChecklistImageBlobUrlMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("302-redirects to the blob url when present", async () => {
    getChecklistImageBlobUrlMock.mockResolvedValueOnce(
      "https://blob.example/checklist/mouse-holes.png",
    );
    const { GET } = await import("./route");
    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "mouse-holes" }),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://blob.example/checklist/mouse-holes.png",
    );
  });
});
