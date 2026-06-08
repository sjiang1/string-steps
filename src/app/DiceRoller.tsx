"use client";

import { useState, useRef, useEffect } from "react";
import rhythms from "@data/dice-rhythms.json";

const STORAGE_KEY = "lastDiceFace";

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

export default function DiceRoller() {
  const [face, setFace] = useState(0);
  const [rolling, setRolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      setFace(Math.floor(Math.random() * 6));
      return;
    }
    const n = parseInt(stored, 10);
    if (!isNaN(n) && n >= 0 && n < 6) setFace(n);
  }, []);

  function roll() {
    if (rolling) return;
    setRolling(true);

    let count = 0;
    intervalRef.current = setInterval(() => {
      const next = Math.floor(Math.random() * 6);
      setFace(next);
      count++;
      if (count >= 26) {
        clearInterval(intervalRef.current!);
        setRolling(false);
        localStorage.setItem(STORAGE_KEY, String(next));
      }
    }, 120);
  }

  const rhythm = rhythms.find((r) => r.face === face + 1);

  return (
    <button
      onClick={roll}
      className="flex items-center gap-2 p-1"
    >
      <span className={`inline-block transition-transform ${rolling ? "animate-bounce" : ""}`}>
        <svg width="36" height="36" viewBox="0 0 100 100" aria-label={`Dice showing ${face + 1}`}>
          <rect x="5" y="5" width="90" height="90" rx="15" ry="15" fill={FACE_COLORS[face]} />
          {PIP_POSITIONS[face].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="10" fill="black" />
          ))}
        </svg>
      </span>
      {rhythm && (
        <span className="text-base">
          <span className="mr-1">{rhythm.emoji}</span>
          <span className="text-zinc-700">{rhythm.label}</span>
        </span>
      )}
    </button>
  );
}
