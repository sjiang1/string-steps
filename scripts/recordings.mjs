import { basename, extname } from "node:path";
import { contentTypeFor } from "./media-migration.mjs";

export function trackFromFilename(filename) {
  const rawExt = extname(filename);
  const ext = rawExt.toLowerCase();
  const contentType = contentTypeFor(filename); // throws on unknown extension
  const id = basename(filename, rawExt);
  const name = id.replaceAll("_", " ");
  const type = ext === ".mp4" ? "video" : "audio";
  const folder = type === "video" ? "videos" : "audio";
  const blobPathname = `${folder}/${id}${ext}`;
  const file = `/api/v/${id}`;
  return { id, name, type, ext, contentType, blobPathname, file };
}
