"use client";

import { useEffect, useRef, useState } from "react";
import { saveTrackNote } from "./actions";
import { useTrackedAction } from "./ServerActivity";
import { todayLocal } from "./today";

const today = todayLocal();

export default function TrackNote({
  trackId,
  initialNote,
}: {
  trackId: string;
  initialNote: string;
}) {
  const [note, setNote] = useState(initialNote);
  const [editing, setEditing] = useState(false);
  const track = useTrackedAction();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    setEditing(false);
    const trimmed = note.trim();
    setNote(trimmed);
    await track(saveTrackNote(today, trackId, trimmed));
  }

  if (!editing && note === "") {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-2 text-xs text-zinc-400 hover:text-zinc-600"
      >
        📝 Add note
      </button>
    );
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-2 block text-left text-sm italic text-zinc-500"
      >
        💬 “{note}”
      </button>
    );
  }

  return (
    <textarea
      ref={inputRef}
      value={note}
      onChange={(e) => setNote(e.target.value)}
      onBlur={commit}
      rows={1}
      placeholder="How did this track go today?"
      className="mt-2 w-full resize-none rounded border border-zinc-200 p-2 text-sm"
    />
  );
}
