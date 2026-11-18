import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Hoisted: the next/server mock is applied at the static import above, before
// ordinary top-level consts exist.
const { addTrackMock, markMock, jobMock, afterMock } = vi.hoisted(() => ({
  addTrackMock: vi.fn(async () => undefined),
  markMock: vi.fn(async () => undefined),
  jobMock: vi.fn(async () => undefined),
  afterMock: vi.fn((cb: () => unknown) => {
    void cb();
  }),
}));

vi.mock("../../actions", () => ({
  addTrack: addTrackMock,
}));
vi.mock("../../reencode-marks", () => ({ markReencoding: markMock }));
vi.mock("../../reencode-job", () => ({ runReencodeJob: jobMock }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: afterMock,
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
    markMock.mockClear();
    jobMock.mockClear();
    afterMock.mockClear();
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
    expect(markMock).not.toHaveBeenCalled();
    expect(jobMock).not.toHaveBeenCalled();
  });

  it("returns 400 when required fields are missing", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      await makeRequest({ id: "x", name: "" }, "Bearer secret-token"),
    );
    expect(response.status).toBe(400);
    expect(addTrackMock).not.toHaveBeenCalled();
    expect(markMock).not.toHaveBeenCalled();
    expect(jobMock).not.toHaveBeenCalled();
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

  it("marks the track before replying and runs the re-encode job after", async () => {
    const order: string[] = [];
    markMock.mockImplementation(async () => {
      order.push("mark");
    });
    jobMock.mockImplementation(async () => {
      order.push("job");
    });
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
    expect(markMock).toHaveBeenCalledWith("may-song-bread");
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(jobMock).toHaveBeenCalledWith(
      "may-song-bread",
      "https://blob.example/tracks/may-song-bread.mp4",
    );
    expect(order).toEqual(["mark", "job"]);
  });

  it("exports maxDuration = 300", async () => {
    const mod = await import("./route");
    expect(mod.maxDuration).toBe(300);
  });
});
