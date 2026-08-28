"use client";

import { useEffect, useState } from "react";
import PracticeDie, { storedDieFace } from "./PracticeDie";
import TaskList, { TaskTypeDef } from "./TaskList";
import TrackNote from "./TrackNote";
import { itemDisplayName, primaryTrackId, rolledTrackId, type PracticeItem, type Track } from "./plans";
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
  // All keyed by itemKey (= the item's first pool track).
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
          // Unnamed items are titled by whatever track they currently resolve
          // to; named items keep their own title and show the track beneath.
          const trackName = track?.name ?? trackId;
          const title = item.name ?? trackName;
          const showTrackLine = item.name !== undefined && trackName !== title;
          return (
            <li key={itemKey} className="rounded-lg border bg-white p-4">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold">{title}</h3>
                {track?.type === "video" && (
                  <span className="text-xs bg-zinc-100 text-zinc-500 rounded px-1.5 py-0.5">
                    video
                  </span>
                )}
                {item.dice && (
                  <button
                    onClick={() => setActiveDieItemKey(itemKey)}
                    aria-label={`Roll the die for ${title}`}
                    className="ml-auto text-xl opacity-50 hover:opacity-100"
                  >
                    🎲
                  </button>
                )}
              </div>
              {item.teacherNote && (
                <p className="mb-2 text-sm italic text-zinc-600">
                  👨‍🏫 {item.teacherNote}
                </p>
              )}
              {rolledRhythm && (
                <p className="mb-2 text-sm font-medium text-violet-700">
                  🎲 {rolledRhythm.emoji} {rolledRhythm.label}
                </p>
              )}
              {showTrackLine && (
                <p className="mb-2 text-sm text-zinc-500">♪ {trackName}</p>
              )}
              <TaskList
                trackId={trackId}
                tasks={item.tasks}
                taskTypes={taskTypes}
                initialDone={doneTasks}
              />
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
          heading={`Rolling for ${itemDisplayName(activeDieItem, tracks)}!`}
          choiceCount={activeDieItem.dieChoices!.length}
          onSettle={(face) => {
            setRolledFaces((m) => ({ ...m, [primaryTrackId(activeDieItem)]: face }));
          }}
          onClose={() => setActiveDieItemKey(null)}
        />
      )}
    </>
  );
}
