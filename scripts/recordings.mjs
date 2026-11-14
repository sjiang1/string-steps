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

// Decide what add-recordings.mjs should do with each file in recordings/.
// Never throws on a stray file: unsupported extensions (e.g. raw .MOV from
// the phone) are reported as skips so one odd file can't block the batch.
export function planRecordings(files, existingIds) {
  const toAdd = [];
  const skipped = [];
  for (const file of [...files].filter((f) => !f.startsWith(".")).sort()) {
    let track;
    try {
      track = trackFromFilename(file);
    } catch {
      skipped.push({
        file,
        reason: `unsupported extension ${extname(file)} — convert videos to .mp4 first`,
      });
      continue;
    }
    if (existingIds.has(track.id)) {
      skipped.push({ file, reason: "already in tracks:list" });
      continue;
    }
    toAdd.push({ file, track });
  }
  return { toAdd, skipped };
}
