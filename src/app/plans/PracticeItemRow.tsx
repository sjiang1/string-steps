"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { itemDisplayName, primaryTrackId, type DieChoice, type PracticeItem, type PlanTask, type Track } from "../plans";
import { rhythmById, rhythms } from "../rhythms";
import TaskChip from "./TaskChip";
import TeacherNoteField from "./TeacherNoteField";
import { sortTasks } from "./task-order";

const TASK_LABEL: Record<string, string> = {
  sing: "Sing",
  playWithTrack: "Play w/ track",
  playWithoutTrack: "Play w/o track",
};

// Enabling the die starts from a sensible list: a multi-track pool rolls
// between its tracks; a single-track pool gets the six legacy rhythms.
function defaultDieChoices(item: PracticeItem): DieChoice[] {
  if (item.trackChoices.length > 1) {
    return item.trackChoices.slice(0, 6).map((trackId) => ({ kind: "track", trackId }));
  }
  return rhythms.map((r) => ({ kind: "rhythm", rhythmId: r.id }));
}

export default function PracticeItemRow({
  item,
  tracks,
  disabled,
  invalidTaskIndices,
  onChange,
  onAddTrack,
  onReplaceTrack,
  onRemoveTrack,
  onRemove,
}: {
  item: PracticeItem;
  tracks: Track[];
  disabled: boolean;
  invalidTaskIndices: Set<number>;
  onChange: (next: PracticeItem) => void;
  onAddTrack: () => void;
  onReplaceTrack: (trackId: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onRemove: () => void;
}) {
  const track = tracks.find((t) => t.id === primaryTrackId(item));
  // Draft of the item's own name; committed to the plan on blur.
  const [nameDraft, setNameDraft] = useState(item.name ?? "");
  const trackName = (id: string) => tracks.find((t) => t.id === id)?.name ?? id;
  const [addingDieChoice, setAddingDieChoice] = useState(false);

  const dieChoices = item.dieChoices ?? [];

  function choiceLabel(choice: DieChoice): string {
    if (choice.kind === "track") return trackName(choice.trackId);
    const rhythm = rhythmById(choice.rhythmId);
    return rhythm ? `${rhythm.emoji} ${rhythm.label}` : choice.rhythmId;
  }

  function addDieChoice(choice: DieChoice) {
    onChange({ ...item, dieChoices: [...dieChoices, choice] });
    setAddingDieChoice(false);
  }
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: primaryTrackId(item), disabled });

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
          <h3>{itemDisplayName(item, tracks)}</h3>
          {track && (
            <span className="text-xs bg-zinc-100 text-zinc-500 rounded px-1.5 py-0.5 font-normal">
              {track.type}
            </span>
          )}
        </div>
        <button
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove practice item"
          className="rounded px-2 text-zinc-400 hover:text-red-600 disabled:hover:text-zinc-400"
        >
          ×
        </button>
      </div>

      <div className="p-3 space-y-2">
      <input
        type="text"
        aria-label="Item name"
        placeholder="Item name (optional — defaults to the first track)"
        value={nameDraft}
        disabled={disabled}
        onChange={(e) => setNameDraft(e.target.value)}
        onBlur={() => {
          const trimmed = nameDraft.trim();
          setNameDraft(trimmed);
          if (trimmed !== (item.name ?? "")) onChange({ ...item, name: trimmed === "" ? undefined : trimmed });
        }}
        className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        {item.trackChoices.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 text-sm text-sky-900"
          >
            <button
              onClick={() => onReplaceTrack(id)}
              disabled={disabled}
              title="Change this track"
              className="disabled:text-zinc-400"
            >
              {trackName(id)}
            </button>
            {item.trackChoices.length > 1 && (
              <button
                onClick={() => onRemoveTrack(id)}
                disabled={disabled}
                aria-label={`Remove ${trackName(id)} from pool`}
                className="text-sky-700 hover:text-red-600 disabled:text-zinc-400"
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button
          onClick={onAddTrack}
          disabled={disabled}
          className="rounded-full border border-dashed border-zinc-300 px-2 py-1 text-sm text-zinc-500 disabled:text-zinc-300"
        >
          + add track
        </button>
      </div>

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
          onChange={(e) => {
            setAddingDieChoice(false);
            if (e.target.checked) {
              onChange({ ...item, dice: true, dieChoices: defaultDieChoices(item) });
            } else {
              const next: PracticeItem = { ...item, dice: false };
              delete next.dieChoices;
              onChange(next);
            }
          }}
        />
        Dice
      </label>

      {item.dice && (
        <div className="ml-6 space-y-1">
          {dieChoices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-right tabular-nums text-zinc-500">{i + 1}.</span>
              <span className="flex-1">{choiceLabel(choice)}</span>
              <button
                onClick={() =>
                  onChange({ ...item, dieChoices: dieChoices.filter((_, j) => j !== i) })
                }
                disabled={disabled}
                aria-label={`Remove die choice ${i + 1}`}
                className="rounded px-2 text-zinc-400 hover:text-red-600 disabled:hover:text-zinc-400"
              >
                ×
              </button>
            </div>
          ))}
          {dieChoices.length < 6 && !addingDieChoice && (
            <button
              onClick={() => setAddingDieChoice(true)}
              disabled={disabled}
              className="rounded-full border border-dashed border-zinc-300 px-2 py-1 text-sm text-zinc-500 disabled:text-zinc-300"
            >
              + add choice
            </button>
          )}
          {dieChoices.length < 6 && addingDieChoice && (
            <div className="flex flex-wrap gap-1">
              {item.trackChoices.map((id) => (
                <button
                  key={`track-${id}`}
                  onClick={() => addDieChoice({ kind: "track", trackId: id })}
                  disabled={disabled}
                  className="rounded-full bg-sky-100 px-2 py-1 text-sm text-sky-900"
                >
                  {trackName(id)}
                </button>
              ))}
              {rhythms.map((r) => (
                <button
                  key={`rhythm-${r.id}`}
                  onClick={() => addDieChoice({ kind: "rhythm", rhythmId: r.id })}
                  disabled={disabled}
                  className="rounded-full bg-violet-100 px-2 py-1 text-sm text-violet-900"
                >
                  {r.emoji} {r.label}
                </button>
              ))}
              <button
                onClick={() => setAddingDieChoice(false)}
                disabled={disabled}
                className="rounded-full px-2 py-1 text-sm text-zinc-500"
              >
                cancel
              </button>
            </div>
          )}
        </div>
      )}

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
