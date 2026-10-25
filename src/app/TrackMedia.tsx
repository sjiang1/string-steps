"use client";

import type { Track } from "./plans";

// Browsers reset playbackRate whenever the media (re)loads, so re-apply the
// speed on every loadedmetadata, not just on mount.
function SpeedAudio({ src, speed }: { src: string; speed: number }) {
  const apply = (el: HTMLAudioElement | null) => {
    if (!el) return;
    el.defaultPlaybackRate = speed;
    el.playbackRate = speed;
  };
  return (
    <audio
      ref={apply}
      controls
      className="w-full mb-2"
      src={src}
      onLoadedMetadata={(e) => apply(e.currentTarget)}
    />
  );
}

export default function TrackMedia({ track, speed }: { track: Track | undefined; speed: number }) {
  if (track?.type === "audio" && track.file) return <SpeedAudio src={track.file} speed={speed} />;
  if (track?.type === "video" && track.file) {
    return <video controls className="max-h-[400px] rounded mb-2" src={track.file} />;
  }
  return null;
}
