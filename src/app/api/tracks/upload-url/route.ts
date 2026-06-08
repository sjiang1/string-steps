import { NextRequest, NextResponse } from "next/server";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { verifyUploadToken } from "../../../upload-token";
import { nextAvailableTrackId } from "../../../track-id";
import { getTracks } from "../../../actions";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

// Internal version constant from @vercel/blob v2.3.3's chunk-WLMB4XQD.js
// (`BLOB_API_VERSION`). Not exported; bump when the SDK bumps.
const BLOB_API_VERSION = "12";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyUploadToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const rwToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!rwToken) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN env var is not set" },
      { status: 500 },
    );
  }

  const tracks = await getTracks();
  const id = nextAvailableTrackId(
    name,
    tracks.map((t) => t.id),
  );

  const pathname = `tracks/${id}.mp4`;
  const clientToken = await generateClientTokenFromReadWriteToken({
    token: rwToken,
    pathname,
    validUntil: Date.now() + FIVE_MINUTES_MS,
    addRandomSuffix: false,
    allowedContentTypes: ["video/mp4"],
  });

  // BLOB_READ_WRITE_TOKEN format is `vercel_blob_rw_<storeId>_<secret>`.
  const storeId = rwToken.split("_")[3] ?? "";
  const blobUrl = `https://${storeId}.public.blob.vercel-storage.com/${pathname}`;
  const uploadUrl = `https://vercel.com/api/blob/?pathname=${encodeURIComponent(pathname)}`;
  const uploadHeaders = {
    "x-api-version": BLOB_API_VERSION,
    "x-vercel-blob-access": "public",
    "x-content-type": "video/mp4",
    "x-add-random-suffix": "0",
  };

  return NextResponse.json({
    id,
    pathname,
    uploadUrl,
    clientToken,
    uploadHeaders,
    blobUrl,
  });
}
