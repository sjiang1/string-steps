// track:blob — track ID → public Blob URL of its media file, as a Redis hash.
// Written by the upload route, the recording scripts and the re-encode job,
// each touching only its own field.
import { dataPath, hashGet, hashGetAll, hashSet, stringCodec, type FileRef } from "./storage";

const TRACK_BLOBS_KEY = "track:blob";
const fileRef = (): FileRef => ({ path: dataPath("TRACK_BLOBS_JSON_PATH", "track-blobs.json") });

export async function getTrackBlobs(): Promise<Record<string, string>> {
  return hashGetAll(TRACK_BLOBS_KEY, fileRef(), stringCodec);
}

export async function getTrackBlobUrl(id: string): Promise<string | null> {
  return hashGet(TRACK_BLOBS_KEY, fileRef(), stringCodec, id);
}

export async function setTrackBlobUrl(id: string, url: string): Promise<void> {
  await hashSet(TRACK_BLOBS_KEY, fileRef(), stringCodec, id, url);
}
