// ffmpeg on the server, for the re-encode job (#31). The recipe itself lives
// in scripts/video-recipe.mjs so the manual script and this job cannot drift.
import ffmpegStatic from "ffmpeg-static";
import { execFile } from "child_process";
import { promisify } from "util";
import { open, writeFile } from "fs/promises";
import { atomsAreFaststart, ffmpegArgs, parseInputBitrate } from "../../scripts/video-recipe.mjs";

const execFileP = promisify(execFile);
const HEAD_BYTES = 262_144;

export function ffmpegBinary(): string {
  if (!ffmpegStatic) throw new Error("ffmpeg-static has no binary for this platform");
  return ffmpegStatic;
}

export async function downloadToFile(url: string, path: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

// faststart from the first 256 KB of boxes; bitrate from ffmpeg's input banner
// (`ffmpeg -i` with no output exits 1 and prints the banner to stderr). No
// `-loglevel error` here: it would silence the banner and the bitrate would
// always read as null.
export async function inspectLocalVideo(
  path: string,
): Promise<{ faststart: boolean; bitrate: number | null }> {
  const fh = await open(path, "r");
  let head: Buffer;
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
    head = buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
  const faststart = atomsAreFaststart(head);

  let stderr = "";
  try {
    ({ stderr } = await execFileP(ffmpegBinary(), ["-hide_banner", "-i", path]));
  } catch (err) {
    stderr = String((err as { stderr?: string }).stderr ?? "");
  }
  return { faststart, bitrate: parseInputBitrate(stderr) };
}

export async function encodeVideo(inPath: string, outPath: string): Promise<void> {
  await execFileP(ffmpegBinary(), ffmpegArgs(inPath, outPath), { maxBuffer: 16 * 1024 * 1024 });
}
