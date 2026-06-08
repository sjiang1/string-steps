"use client";

import type { PlanTask } from "../plans";

const TASK_LABEL: Record<string, string> = {
  sing: "Sing",
  playWithTrack: "Play w/ track",
  playWithoutTrack: "Play w/o track",
};

const TASK_EMOJI: Record<string, string> = {
  sing: "🎤",
  playWithTrack: "🎵",
  playWithoutTrack: "🎻",
};

const TASK_TYPES = ["sing", "playWithTrack", "playWithoutTrack"] as const;

export default function TaskChip({
  task,
  invalid,
  disabled,
  onChange,
  onRemove,
}: {
  task: PlanTask;
  invalid?: boolean;
  disabled: boolean;
  onChange: (next: PlanTask) => void;
  onRemove: () => void;
}) {
  const isFocus = task.focus !== undefined;
  const borderClass = invalid ? "border-red-400" : "border-zinc-300";

  return (
    <div className={`inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-sm ${borderClass}`}>
      {isFocus ? (
        <>
          <select
            value={task.type}
            disabled={disabled}
            onChange={(e) => onChange({ ...task, type: e.target.value })}
            className="rounded bg-transparent text-sm disabled:text-zinc-400"
            aria-label="Focus task action"
          >
            {TASK_TYPES.map((t) => (
              <option key={t} value={t}>
                {TASK_EMOJI[t]} {TASK_LABEL[t]}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={task.focus ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ ...task, focus: e.target.value })}
            placeholder="which part?"
            aria-label="Sub-part label"
            className="w-28 rounded border border-zinc-200 px-1 text-sm disabled:bg-zinc-50"
          />
        </>
      ) : (
        <span>
          {TASK_EMOJI[task.type] ?? "🎵"} {TASK_LABEL[task.type] ?? task.type}
        </span>
      )}
      <button
        onClick={() => onChange({ ...task, count: Math.max(1, task.count - 1) })}
        disabled={disabled || task.count <= 1}
        aria-label="Decrease count"
        className="px-1 text-zinc-500 disabled:text-zinc-300"
      >
        –
      </button>
      <span className="tabular-nums w-4 text-center">{task.count}</span>
      <button
        onClick={() => onChange({ ...task, count: task.count + 1 })}
        disabled={disabled}
        aria-label="Increase count"
        className="px-1 text-zinc-500 disabled:text-zinc-300"
      >
        +
      </button>
      <button
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove task"
        className="ml-1 rounded px-1 text-zinc-400 hover:text-red-600 disabled:hover:text-zinc-400"
      >
        ×
      </button>
    </div>
  );
}
