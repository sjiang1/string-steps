// tracks:blobs — track ID → public Blob URL of its media file.
import { dataPath, readJson, writeJson } from "./storage";

const TRACK_BLOBS_KEY = "tracks:blobs";
const trackBlobsPath = () => dataPath("TRACK_BLOBS_JSON_PATH", "track-blobs.json");

export async function getTrackBlobs(): Promise<Record<string, string>> {
  return readJson<Record<string, string>>(TRACK_BLOBS_KEY, trackBlobsPath(), {});
}

// Read-modify-write of one entry. Always re-reads the map first so a URL
// written by someone else in the meantime (the re-encode job, the manual
// script) is kept rather than overwritten with a stale copy.
export async function setTrackBlobUrl(id: string, url: string): Promise<void> {
  const blobs = await getTrackBlobs();
  blobs[id] = url;
  await writeJson(TRACK_BLOBS_KEY, trackBlobsPath(), blobs);
}
