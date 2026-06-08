"use client";

import { useEffect, useRef, useState } from "react";

export default function TeacherNoteField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    setDraft(trimmed);
    if (trimmed !== value) onChange(trimmed);
  }

  if (editing) {
    return (
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        rows={2}
        placeholder="What did your teacher say about this piece?"
        className="mt-2 w-full resize-none rounded border border-zinc-200 p-2 text-sm"
      />
    );
  }

  if (value === "") {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={disabled}
        className="mt-2 text-xs text-zinc-400 hover:text-zinc-600 disabled:text-zinc-300"
      >
        👨‍🏫 + Add teacher&rsquo;s note
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={disabled}
      className="mt-2 block text-left text-sm italic text-zinc-600 disabled:text-zinc-400"
    >
      👨‍🏫 &ldquo;{value}&rdquo;
    </button>
  );
}
