"use client";

import { useState } from "react";
import type { Track } from "../plans";

export default function TrackPicker({
  tracks,
  inPlan,
  heading = "Add track",
  onPick,
  onCreate,
  onClose,
}: {
  tracks: Track[];
  inPlan: string[];
  heading?: string;
  onPick: (track: Track) => void;
  // When provided, the search box doubles as a "create a no-track practice"
  // field: if the typed name matches no existing track, a create row appears.
  onCreate?: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inPlanSet = new Set(inPlan);
  const trimmed = query.trim();
  const filtered = tracks.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()),
  );
  const hasExactMatch = tracks.some(
    (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = !!onCreate && trimmed !== "" && !hasExactMatch;

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="w-full max-w-md rounded-t-lg bg-white p-4 sm:rounded-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{heading}</h3>
          <button onClick={onClose} aria-label="Close" className="text-zinc-500">×</button>
        </div>

        <input
          type="text"
          placeholder={onCreate ? "Search or name a new practice…" : "Search tracks…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCreate) {
              e.preventDefault();
              onCreate!(trimmed);
            }
          }}
          className="mb-3 w-full rounded-md border border-zinc-300 px-3 py-2"
        />

        <ul className="max-h-[50vh] overflow-y-auto space-y-1">
          {canCreate && (
            <li>
              <button
                onClick={() => onCreate!(trimmed)}
                className="w-full text-left px-3 py-2 rounded-md bg-green-50 hover:bg-green-100 text-green-800"
              >
                ➕ Create &ldquo;{trimmed}&rdquo;{" "}
                <span className="text-xs">(practice, no track)</span>
              </button>
            </li>
          )}
          {filtered.map((t) => {
            const already = inPlanSet.has(t.id);
            return (
              <li key={t.id}>
                <button
                  disabled={already}
                  onClick={() => onPick(t)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  {t.name}
                  {already && <span className="ml-2 text-xs">(already in plan)</span>}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && !canCreate && (
            <li className="text-sm text-zinc-500 px-3 py-2">No matches.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
