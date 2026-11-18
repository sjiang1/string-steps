import { NextRequest, NextResponse, after } from "next/server";
import { verifyUploadToken } from "../../upload-token";
import { addTrack } from "../../actions";
import { markReencoding } from "../../reencode-marks";
import { runReencodeJob } from "../../reencode-job";
import type { Track } from "../../plans";

// The re-encode runs in after(), past the reply to the phone; encoding takes
// about real time, so this covers clips up to roughly five minutes (#31).
export const maxDuration = 300;

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
  // Mark first so the ⚠️ shows the moment the track exists; the job clears it.
  // The mark is only an aid: if its store is broken the upload still succeeds
  // and the re-encode still runs.
  try {
    await markReencoding(id);
  } catch (err) {
    console.error(`could not mark ${id} for re-encoding; continuing without the ⚠️`, err);
  }
  after(() => runReencodeJob(id, blobUrl));
  return NextResponse.json({ ok: true, id });
}
