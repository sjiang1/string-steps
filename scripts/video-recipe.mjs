// The one definition of what a streaming-ready teacher-demo video is and how
// to make one. Shared by scripts/reencode-videos.mjs (manual, Mac) and the
// server-side re-encode after a Shortcut upload (#31). Plain ESM with no
// Node-only imports so both Node scripts and Next.js code can import it.

// A served video must stream cleanly: faststart (moov at front) and a sane
// bitrate. The ffmpeg recipe yields ~1.2 Mbps; the bad iOS files were 5.5–11.5.
export const BITRATE_CEILING = 2_500_000;

export function needsReencode({ faststart, bitrate }) {
  if (!faststart) return true;
  if (typeof bitrate === "number" && bitrate > BITRATE_CEILING) return true;
  return false;
}

// Mirrors the README ffmpeg recipe, but caps height at 720 WITHOUT upscaling
// smaller sources (min(720,ih)). The comma in min() is escaped for ffmpeg's
// filtergraph parser since this is passed as a single argv element.
export function ffmpegArgs(inPath, outPath) {
  return [
    "-y", "-loglevel", "error",
    "-i", inPath,
    "-vcodec", "libx264", "-crf", "28", "-preset", "medium",
    "-vf", "scale=-2:min(720\\,ih)",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    outPath,
  ];
}

// New, cache-busting pathname. If the video already lives at the target path
// (e.g. a prior re-encode), add a suffix so the URL still changes.
export function newPathnameFor(id, oldPathname) {
  const target = `videos/${id}.mp4`;
  return target === oldPathname ? `videos/${id}-reencoded.mp4` : target;
}

// Walks the top-level MP4 boxes in the first bytes of a file and reports
// whether moov comes before mdat (= faststart). 256 KB is plenty of head.
export function atomsAreFaststart(buf) {
  let o = 0;
  const seq = [];
  while (o + 8 <= buf.length && seq.length < 8) {
    let size = buf.readUInt32BE(o);
    const type = buf.toString("latin1", o + 4, o + 8);
    if (!/^[ -~]{4}$/.test(type)) break;
    seq.push(type);
    if (size === 1) {
      if (o + 16 > buf.length) break;
      size = Number(buf.readBigUInt64BE(o + 8));
    }
    if (size < 8) break;
    o += size;
  }
  const m = seq.indexOf("moov");
  const d = seq.indexOf("mdat");
  return m > -1 && (d < 0 || m < d);
}

// Bitrate in bit/s from the banner `ffmpeg -i <file>` prints to stderr
// ("Duration: 00:00:58.03, start: 0.000000, bitrate: 5523 kb/s"), for
// environments without ffprobe. null when ffmpeg printed N/A or nothing.
export function parseInputBitrate(ffmpegStderr) {
  const m = /bitrate:\s*(\d+)\s*kb\/s/.exec(ffmpegStderr);
  return m ? parseInt(m[1], 10) * 1000 : null;
}
