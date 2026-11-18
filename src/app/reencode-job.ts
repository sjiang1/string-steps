// Re-encodes one Shortcut upload after the route has replied to the phone
// (#31): download, inspect, and if the video is not streaming-ready, encode it
// with the shared recipe, upload the result to videos/<id>.mp4, repoint the
// track's blob URL, clear its ⚠️ mark and delete the original. The original
// stays live until the swap has succeeded; any failure leaves the mark in
// place with the error on it. Never rejects: it runs inside after().
import { put, del } from "@vercel/blob";
import { mkdtemp, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { needsReencode, newPathnameFor } from "../../scripts/video-recipe.mjs";
import { downloadToFile, encodeVideo, inspectLocalVideo } from "./video-tools";
import { clearReencodeMark, recordReencodeError } from "./reencode-marks";
import { setTrackBlobUrl } from "./track-blobs";

export async function runReencodeJob(id: string, blobUrl: string): Promise<void> {
  // Created inside the try so a failure here is recorded on the mark too.
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "reencode-"));
    const inPath = join(dir, `${id}.in.mp4`);
    const outPath = join(dir, `${id}.out.mp4`);

    await downloadToFile(blobUrl, inPath);
    const probe = await inspectLocalVideo(inPath);
    if (!needsReencode(probe)) {
      await clearReencodeMark(id);
      return;
    }

    await encodeVideo(inPath, outPath);
    const oldPathname = new URL(blobUrl).pathname.replace(/^\/+/, "");
    const newPathname = newPathnameFor(id, oldPathname);
    const { url: newUrl } = await put(newPathname, await readFile(outPath), {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    await setTrackBlobUrl(id, newUrl);
    await clearReencodeMark(id);
    if (newPathname !== oldPathname) {
      try {
        await del(blobUrl);
      } catch (err) {
        console.error(`re-encode ${id}: new file is live but deleting ${blobUrl} failed`, err);
      }
    }
  } catch (err) {
    console.error(`re-encode ${id} failed`, err);
    try {
      await recordReencodeError(id, err instanceof Error ? err.message : String(err));
    } catch (markErr) {
      console.error(`re-encode ${id}: could not record the error on its mark`, markErr);
    }
  } finally {
    if (dir !== null) await rm(dir, { recursive: true, force: true });
  }
}
