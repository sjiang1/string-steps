// track:all — track id → Track, as a Redis hash. Empty in Redis on a fresh
// deployment, so the committed data/tracks.json (an object keyed by id, the
// same shape) seeds it. In dev that file is the store.
import tracksSeed from "@data/tracks.json";
import type { Track } from "./plans";
import { dataPath, hashSeedIfEmpty, hashSetIfAbsent, jsonCodec, type FileRef } from "./storage";

const TRACKS_KEY = "track:all";
const codec = jsonCodec<Track>();
const fileRef = (): FileRef => ({ path: dataPath("TRACKS_JSON_PATH", "tracks.json") });

// Hash order is not stable; callers that show a list sort it themselves.
export async function getTracks(): Promise<Track[]> {
  return Object.values(
    await hashSeedIfEmpty(TRACKS_KEY, fileRef(), codec, tracksSeed as Record<string, Track>),
  );
}

// Adds each track whose id is not yet in the catalog and returns those; an id
// that exists is left as is (idempotent against double-saves and re-uploads).
export async function addTracks(tracks: Track[]): Promise<Track[]> {
  const added: Track[] = [];
  for (const track of tracks) {
    if (await hashSetIfAbsent(TRACKS_KEY, fileRef(), codec, track.id, track)) added.push(track);
  }
  return added;
}
