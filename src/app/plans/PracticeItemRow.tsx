"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PracticeItem, PlanTask, Track } from "../plans";
import TaskChip from "./TaskChip";
import TeacherNoteField from "./TeacherNoteField";
import { sortTasks } from "./task-order";

const TASK_LABEL: Record<string, string> = {
  sing: "Sing",
  playWithTrack: "Play w/ track",
  playWithoutTrack: "Play w/o track",
};

export default function PracticeItemRow({
  item,
  track,
  disabled,
  invalidTaskIndices,
  onChange,
  onChangeTrack,
  onRemove,
}: {
  item: PracticeItem;
  track: Track | undefined;
  disabled: boolean;
  invalidTaskIndices: Set<number>;
  onChange: (next: PracticeItem) => void;
  onChangeTrack: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.trackId, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="rounded-xl bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 bg-sky-50 px-3 py-2">
        <button
          type="button"
          {...listeners}
          disabled={disabled}
          aria-label="Drag to reorder"
          className="cursor-grab touch-none text-zinc-400 hover:text-zinc-600 disabled:cursor-default disabled:text-zinc-200"
        >
          ⠿
        </button>
        <div className="font-semibold flex-1 flex items-center gap-2">
          <span>{track?.name ?? item.trackId}</span>
          {track && (
            <span className="text-xs bg-zinc-100 text-zinc-500 rounded px-1.5 py-0.5 font-normal">
              {track.type}
            </span>
          )}
        </div>
        <button
          onClick={onChangeTrack}
          disabled={disabled}
          className="rounded px-2 text-xs font-medium text-sky-700 hover:text-sky-900 disabled:text-zinc-300"
        >
          Change
        </button>
        <button
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove track"
          className="rounded px-2 text-zinc-400 hover:text-red-600 disabled:hover:text-zinc-400"
        >
          ×
        </button>
      </div>

      <div className="p-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {item.tasks.map((task, idx) => (
          <TaskChip
            key={idx}
            task={task}
            invalid={invalidTaskIndices.has(idx)}
            disabled={disabled}
            onChange={(next) =>
              onChange({
                ...item,
                tasks: item.tasks.map((t, i) => (i === idx ? next : t)),
              })
            }
            onRemove={() =>
              onChange({
                ...item,
                tasks: item.tasks.filter((_, i) => i !== idx),
              })
            }
          />
        ))}
        {(
          [
            { type: "sing", dedup: true, task: { type: "sing", count: 1 } },
            { type: "focus", dedup: false, task: { type: "playWithoutTrack", count: 6, focus: "" } },
            { type: "playWithoutTrack", dedup: true, task: { type: "playWithoutTrack", count: 1 } },
            { type: "playWithTrack", dedup: true, task: { type: "playWithTrack", count: 1 } },
          ] as Array<{ type: string; dedup: boolean; task: PlanTask }>
        )
          .filter(
            (b) =>
              !b.dedup ||
              !item.tasks.some((x) => x.type === b.type && x.focus === undefined),
          )
          .map((b) => (
            <button
              key={b.type}
              onClick={() =>
                onChange({ ...item, tasks: sortTasks([...item.tasks, b.task]) })
              }
              disabled={disabled}
              className="rounded-full border border-dashed border-zinc-300 px-2 py-1 text-sm text-zinc-500 disabled:text-zinc-300"
            >
              + add {b.type === "focus" ? "focus task" : TASK_LABEL[b.type]}
            </button>
          ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={item.dice}
          disabled={disabled}
          onChange={(e) => onChange({ ...item, dice: e.target.checked })}
        />
        Dice
      </label>

      <TeacherNoteField
        value={item.teacherNote ?? ""}
        disabled={disabled}
        onChange={(next) =>
          onChange({ ...item, teacherNote: next === "" ? undefined : next })
        }
      />
      </div>
    </div>
  );
}
