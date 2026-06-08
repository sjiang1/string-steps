import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const addTrackMock = vi.fn(async () => undefined);

vi.mock("../../actions", () => ({
  addTrack: addTrackMock,
}));

async function makeRequest(body: unknown, auth?: string): Promise<NextRequest> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers["authorization"] = auth;
  return new NextRequest("https://example.com/api/tracks", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

describe("POST /api/tracks", () => {
  beforeEach(() => {
    vi.stubEnv("UPLOAD_TOKEN", "secret-token");
    addTrackMock.mockClear();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when bearer token is missing", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      await makeRequest({
        id: "x",
        name: "X",
        blobUrl: "https://blob.example/x.mp4",
      }),
    );
    expect(response.status).toBe(401);
    expect(addTrackMock).not.toHaveBeenCalled();
  });

  it("returns 400 when required fields are missing", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      await makeRequest({ id: "x", name: "" }, "Bearer secret-token"),
    );
    expect(response.status).toBe(400);
    expect(addTrackMock).not.toHaveBeenCalled();
  });

  it("calls addTrack with the canonical Track shape on success", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      await makeRequest(
        {
          id: "may-song-bread",
          name: "May Song - Bread",
          blobUrl: "https://blob.example/tracks/may-song-bread.mp4",
        },
        "Bearer secret-token",
      ),
    );
    expect(response.status).toBe(200);
    expect(addTrackMock).toHaveBeenCalledWith(
      {
        id: "may-song-bread",
        name: "May Song - Bread",
        type: "video",
        file: "/api/v/may-song-bread",
      },
      "https://blob.example/tracks/may-song-bread.mp4",
    );
  });
});
