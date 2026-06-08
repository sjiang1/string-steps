import { NextRequest, NextResponse } from "next/server";
import { verifyUploadToken } from "../../upload-token";
import { addTrack } from "../../actions";
import type { Track } from "../../plans";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyUploadToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { id?: string; name?: string; blobUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  const name = (body.name ?? "").trim();
  const blobUrl = (body.blobUrl ?? "").trim();
  if (!id || !name || !blobUrl) {
    return NextResponse.json(
      { error: "id, name, blobUrl are required" },
      { status: 400 },
    );
  }

  const track: Track = {
    id,
    name,
    type: "video",
    file: `/api/v/${id}`,
  };
  await addTrack(track, blobUrl);
  return NextResponse.json({ ok: true, id });
}
