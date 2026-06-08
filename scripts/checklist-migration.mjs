import { extname, join } from "node:path";

const STATIC_PREFIX = "/images/checklist/";

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export function needsMigration(item) {
  if (typeof item.image !== "string") return false;
  return item.image.startsWith(STATIC_PREFIX);
}

export function contentTypeFor(file) {
  const ext = extname(file).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) throw new Error(`Unknown image extension for "${file}"`);
  return contentType;
}

export function localPathFor(item, publicDir) {
  return join(publicDir, item.image);
}

export function blobPathnameFor(item) {
  return `checklist/${item.id}${extname(item.image).toLowerCase()}`;
}

export function proxyPathFor(item) {
  return `/api/img/${item.id}`;
}
