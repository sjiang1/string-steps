"use client";

import { useRef, useState } from "react";
import type { Track } from "./plans";

// Audio gets a big Play/Pause button above the native bar so it can be hit
// from arm's length on the iPad (#50). The button drives the same element the
// native controls do, and its label follows the element's play/pause/ended
// events, so pressing play on either control keeps the other honest.
//
// Browsers reset playbackRate whenever the media (re)loads, so re-apply the
// speed on every loadedmetadata, not just on mount.
function SpeedAudio({ src, speed }: { src: string; speed: number }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const apply = (el: HTMLAudioElement | null) => {
    ref.current = el;
    if (!el) return;
    el.defaultPlaybackRate = speed;
    el.playbackRate = speed;
  };
  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (playing) el.pause();
    else el.play().catch(() => {});
  };
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className={`mb-2 flex min-h-16 w-full items-center justify-center gap-3 rounded-xl text-xl font-semibold ${
          playing ? "bg-zinc-200 text-zinc-900" : "bg-emerald-600 text-white"
        }`}
      >
        {playing ? "⏸ Pause" : "▶ Play"}
      </button>
      <audio
        ref={apply}
        controls
        className="w-full mb-2"
        src={src}
        onLoadedMetadata={(e) => apply(e.currentTarget)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </>
  );
}

export default function TrackMedia({ track, speed }: { track: Track | undefined; speed: number }) {
  if (track?.type === "audio" && track.file) return <SpeedAudio src={track.file} speed={speed} />;
  if (track?.type === "video" && track.file) {
    return <video controls className="max-h-[400px] rounded mb-2" src={track.file} />;
  }
  return null;
}
