import { extname, join } from "node:path";

const STATIC_PREFIXES = ["/audio/", "/videos/"];

const CONTENT_TYPES = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
};

export function needsMigration(track) {
  if (track.type !== "audio" && track.type !== "video") return false;
  if (typeof track.file !== "string") return false;
  return STATIC_PREFIXES.some((prefix) => track.file.startsWith(prefix));
}

export function contentTypeFor(file) {
  const ext = extname(file).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) throw new Error(`Unknown media extension for "${file}"`);
  return contentType;
}

export function localPathFor(track, publicDir) {
  return join(publicDir, track.file);
}

export function blobPathnameFor(track) {
  const folder = track.type === "video" ? "videos" : "audio";
  return `${folder}/${track.id}${extname(track.file).toLowerCase()}`;
}

export function proxyPathFor(track) {
  return `/api/v/${track.id}`;
}
