"use client";

import { useEffect, useState } from "react";
import PracticeDie, { storedDieFace } from "./PracticeDie";
import TaskList, { TaskTypeDef } from "./TaskList";
import TrackNote from "./TrackNote";
import { primaryTrackId, rolledTrackId, type PracticeItem, type Track } from "./plans";
import { rhythmById } from "./rhythms";
import type { Student } from "./students";

interface Props {
  items: PracticeItem[];
  tracks: Track[];
  taskTypes: TaskTypeDef[];
  doneTasks: string[];
  notesByTrack: Record<string, string>;
  activeStudent: Student;
}

export default function PracticeTasksList({ items, tracks, taskTypes, doneTasks, notesByTrack, activeStudent }: Props) {
  // Both keyed by itemKey (= the item's first pool track).
  const [activeDieItemKey, setActiveDieItemKey] = useState<string | null>(null);
  const [rolledFaces, setRolledFaces] = useState<Record<string, number>>({});

  // Restore each die item's last settled face. localStorage is client-only, so
  // this must run post-hydration in an effect — a lazy initializer would make
  // the first client render differ from the server HTML.
  useEffect(() => {
    const restored: Record<string, number> = {};
    for (const item of items) {
      if (!item.dice || !item.dieChoices) continue;
      const face = storedDieFace(primaryTrackId(item), item.dieChoices.length);
      if (face !== null) restored[primaryTrackId(item)] = face;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot localStorage hydration
    if (Object.keys(restored).length > 0) setRolledFaces(restored);
  }, [items]);

  const activeDieItem = items.find(
    (i) => i.dice && i.dieChoices && primaryTrackId(i) === activeDieItemKey,
  );

  return (
    <>
      <ul className="space-y-4">
        {items.map((item) => {
          const itemKey = primaryTrackId(item);
          const face = rolledFaces[itemKey];
          const trackId =
            (face !== undefined ? rolledTrackId(item, face) : null) ?? primaryTrackId(item);
          const track = tracks.find((t) => t.id === trackId);
          const rolledChoice = face !== undefined ? item.dieChoices?.[face - 1] : undefined;
          const rolledRhythm =
            rolledChoice?.kind === "rhythm" ? rhythmById(rolledChoice.rhythmId) : undefined;
          return (
            <li key={itemKey} className="rounded-lg border bg-white p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold">{track?.name ?? trackId}</span>
                {track?.type === "video" && (
                  <span className="text-xs bg-zinc-100 text-zinc-500 rounded px-1.5 py-0.5">
                    video
                  </span>
                )}
              </div>
              {item.teacherNote && (
                <p className="mb-2 text-sm italic text-zinc-600">
                  👨‍🏫 {item.teacherNote}
                </p>
              )}
              <TaskList
                trackId={trackId}
                tasks={item.tasks}
                taskTypes={taskTypes}
                initialDone={doneTasks}
              />
              {item.dice && (
                <div className="mb-2 flex items-center gap-2">
                  <button
                    onClick={() => setActiveDieItemKey(itemKey)}
                    className="rounded-xl bg-violet-100 px-4 py-2 text-base font-medium text-violet-700 active:scale-95"
                  >
                    🎲 Roll for it!
                  </button>
                  {rolledRhythm && (
                    <span className="text-base">
                      <span className="mr-1">{rolledRhythm.emoji}</span>
                      <span className="text-zinc-700">{rolledRhythm.label}</span>
                    </span>
                  )}
                </div>
              )}
              {track?.type === "audio" && track.file && (
                <audio controls className="w-full mb-2" src={track.file} />
              )}
              {track?.type === "video" && track.file && (
                <video controls className="max-h-[400px] rounded mb-2" src={track.file} />
              )}
              {activeStudent.kind === "primary" && (
                <TrackNote
                  trackId={trackId}
                  initialNote={notesByTrack[trackId] ?? ""}
                />
              )}
            </li>
          );
        })}
      </ul>
      {activeDieItem && (
        <PracticeDie
          itemKey={primaryTrackId(activeDieItem)}
          choiceCount={activeDieItem.dieChoices!.length}
          onSettle={(face) =>
            setRolledFaces((m) => ({ ...m, [primaryTrackId(activeDieItem)]: face }))
          }
          onClose={() => setActiveDieItemKey(null)}
        />
      )}
    </>
  );
}
