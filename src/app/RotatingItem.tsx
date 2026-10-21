"use client";

import { useState } from "react";
import TaskList, { type TaskTypeDef } from "./TaskList";
import TrackMedia from "./TrackMedia";
import TrackNote from "./TrackNote";
import { itemOwnName, type PracticeItem, type Track } from "./plans";
import { tracksDoneToday, type RotationView } from "./rotation";
import type { Student } from "./students";

interface Props {
  item: PracticeItem;
  tracks: Track[];
  taskTypes: TaskTypeDef[];
  doneTasks: string[];
  notesByTrack: Record<string, string>;
  activeStudent: Student;
  view: RotationView;
}

// A rotating item shows every pool track: today's suggested ones first, starred
// and open; the rest collapsed but fully practicable. Any perDay finished
// tracks fill the item — the stars are only a suggestion.
export default function RotatingItem({ item, tracks, taskTypes, doneTasks, notesByTrack, activeStudent, view }: Props) {
  const [done, setDone] = useState(doneTasks);
  const [open, setOpen] = useState<Set<string>>(() => new Set(view.suggested));
  const perDay = item.perDay!;
  const ordered = [
    ...view.suggested,
    ...item.trackChoices.filter((id) => !view.suggested.includes(id)),
  ];
  const title = itemOwnName(item) ?? `🔁 ${perDay} of ${item.trackChoices.length} tracks`;

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <li className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h3 className="font-semibold">{title}</h3>
        <span className="ml-auto text-sm tabular-nums text-zinc-600">
          {tracksDoneToday(item, done)}/{perDay} tracks done today
        </span>
      </div>
      {item.teacherNote && (
        <p className="mb-2 text-sm italic text-zinc-600">👨‍🏫 {item.teacherNote}</p>
      )}
      <ul className="space-y-2">
        {ordered.map((id) => {
          const track = tracks.find((t) => t.id === id);
          const isOpen = open.has(id);
          const isSuggested = view.suggested.includes(id);
          return (
            <li key={id} className="rounded-md border border-zinc-200">
              <button
                onClick={() => toggle(id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 px-3 py-3 text-left"
              >
                <span aria-hidden>{isOpen ? "▾" : "▸"}</span>
                {isSuggested && <span>⭐</span>}
                <span className="font-medium">{track?.name ?? id}</span>
                <span className="ml-auto text-sm text-zinc-500">{view.lastDoneLabel[id]}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3">
                  <TaskList
                    trackId={id}
                    tasks={item.tasks}
                    taskTypes={taskTypes}
                    initialDone={done}
                    onDoneChange={setDone}
                  />
                  <TrackMedia track={track} speed={1} />
                  {activeStudent.kind === "primary" && (
                    <TrackNote trackId={id} initialNote={notesByTrack[id] ?? ""} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
