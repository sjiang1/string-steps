import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@vercel/blob/client", () => ({
  generateClientTokenFromReadWriteToken: vi.fn(async () => "fake-client-token"),
}));

vi.mock("../../../actions", () => ({
  getTracks: vi.fn(async () => [
    { id: "may-song", name: "May Song", type: "audio", file: "/audio/x.mp3" },
  ]),
}));

async function makeRequest(body: unknown, auth?: string): Promise<NextRequest> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers["authorization"] = auth;
  return new NextRequest("https://example.com/api/tracks/upload-url", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

describe("POST /api/tracks/upload-url", () => {
  beforeEach(() => {
    vi.stubEnv("UPLOAD_TOKEN", "secret-token");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_fakestor_secretpart");
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when bearer token is missing", async () => {
    const { POST } = await import("./route");
    const response = await POST(await makeRequest({ name: "May Song - Bread" }));
    expect(response.status).toBe(401);
  });

  it("returns 401 when bearer token is wrong", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      await makeRequest({ name: "May Song - Bread" }, "Bearer wrong-token"),
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 when name is missing or empty", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      await makeRequest({ name: "" }, "Bearer secret-token"),
    );
    expect(response.status).toBe(400);
  });

  it("returns id, pathname, uploadUrl, clientToken, uploadHeaders, blobUrl on success", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      await makeRequest({ name: "May Song - Bread" }, "Bearer secret-token"),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.id).toBe("may-song-bread");
    expect(json.pathname).toBe("tracks/may-song-bread.mp4");
    expect(json.uploadUrl).toBe(
      "https://vercel.com/api/blob/?pathname=tracks%2Fmay-song-bread.mp4",
    );
    expect(json.clientToken).toBe("fake-client-token");
    expect(json.uploadHeaders).toEqual({
      "x-api-version": "12",
      "x-vercel-blob-access": "public",
      "x-content-type": "video/mp4",
      "x-add-random-suffix": "0",
    });
    expect(json.blobUrl).toBe(
      "https://fakestor.public.blob.vercel-storage.com/tracks/may-song-bread.mp4",
    );
  });

  it("uses next-available id when slug collides with existing track", async () => {
    const { getTracks } = await import("../../../actions");
    (getTracks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "may-song-bread", name: "x", type: "video", file: "/api/v/x" },
    ]);
    const { POST } = await import("./route");
    const response = await POST(
      await makeRequest({ name: "May Song - Bread" }, "Bearer secret-token"),
    );
    const json = await response.json();
    expect(json.id).toBe("may-song-bread-2");
  });
});
