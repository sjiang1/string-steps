"use client";

import DiceRoller from "./DiceRoller";
import TaskList, { TaskTypeDef } from "./TaskList";
import TrackNote from "./TrackNote";
import { primaryTrackId, type PracticeItem, type Track } from "./plans";
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
  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const trackId = primaryTrackId(item);
        const track = tracks.find((t) => t.id === trackId);
        return (
          <li key={trackId} className="rounded-lg border bg-white p-4">
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
            {item.dice && <DiceRoller />}
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
  );
}
