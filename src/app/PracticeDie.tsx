"use client";

import { useEffect, useRef, useState } from "react";

const FACE_COLORS = [
  "#ef4444", // face 1 - red
  "#f97316", // face 2 - orange
  "#eab308", // face 3 - yellow
  "#22c55e", // face 4 - green
  "#3b82f6", // face 5 - blue
  "#a855f7", // face 6 - purple
];

const PIP_POSITIONS: [number, number][][] = [
  [[50, 50]],                                                    // face 1
  [[25, 25], [75, 75]],                                          // face 2
  [[25, 25], [50, 50], [75, 75]],                                // face 3
  [[25, 25], [75, 25], [25, 75], [75, 75]],                      // face 4
  [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],            // face 5
  [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],  // face 6
];

export function dieFaceStorageKey(itemKey: string): string {
  return `dieFace:${itemKey}`;
}

// The last face this item's die settled on (1–6), or null if never rolled or
// the stored face no longer lands on a choice (list shrank since the roll).
export function storedDieFace(itemKey: string, choiceCount: number): number | null {
  const raw = localStorage.getItem(dieFaceStorageKey(itemKey));
  if (raw === null) return null;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 1 || n > choiceCount) return null;
  return n;
}

// One die face as pip art.
export function DieFace({ face, size }: { face: number; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect x="5" y="5" width="90" height="90" rx="15" ry="15" fill={FACE_COLORS[face - 1]} />
      {PIP_POSITIONS[face - 1].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="10" fill="black" />
      ))}
    </svg>
  );
}

// The one shared die for the practice page. Summoned by a die-enabled practice
// item; a big tap-anywhere target for small fingers. Rolling a face beyond the
// item's choice list is a miss ("roll again!") and is not persisted or
// reported — only hits settle.
export default function PracticeDie({
  itemKey,
  heading,
  choiceCount,
  onSettle,
  onClose,
}: {
  itemKey: string;
  heading?: string;
  choiceCount: number;
  onSettle: (face: number) => void;
  onClose: () => void;
}) {
  const [face, setFace] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [miss, setMiss] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stored = storedDieFace(itemKey, choiceCount);
    if (stored !== null) setFace(stored);
    else setFace(Math.floor(Math.random() * 6) + 1);
  }, [itemKey, choiceCount]);

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    [],
  );

  function roll() {
    if (rolling) return;
    setRolling(true);
    setMiss(false);

    let count = 0;
    intervalRef.current = setInterval(() => {
      const next = Math.floor(Math.random() * 6) + 1;
      setFace(next);
      count++;
      if (count >= 26) {
        clearInterval(intervalRef.current!);
        setRolling(false);
        if (next > choiceCount) {
          setMiss(true);
        } else {
          localStorage.setItem(dieFaceStorageKey(itemKey), String(next));
          onSettle(next);
        }
      }
    }, 90);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="relative flex flex-col items-center gap-4 rounded-3xl bg-white p-8 shadow-xl">
        <button
          onClick={onClose}
          aria-label="Put the die away"
          className="absolute right-2 top-2 rounded px-3 py-1 text-2xl text-zinc-400 hover:text-zinc-600"
        >
          ×
        </button>
        {heading && (
          <p className="mt-2 text-base font-medium text-zinc-500">{heading}</p>
        )}
        <button
          onClick={roll}
          aria-label={`Die showing ${face}, tap to roll`}
          className={`${heading ? "" : "mt-4"} ${rolling ? "animate-bounce" : ""}`}
        >
          <DieFace face={face} size={160} />
        </button>
        <p className="min-h-7 text-xl font-semibold text-zinc-700">
          {rolling ? "Rolling…" : miss ? "🙃 Roll again!" : "Tap the die to roll!"}
        </p>
      </div>
    </div>
  );
}
