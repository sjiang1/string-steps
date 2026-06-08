"use client";

import { useState } from "react";
import confetti from "canvas-confetti";
import { toggleTask } from "./actions";
import { useTrackedAction } from "./ServerActivity";
import type { PlanTask } from "./plans";
import { doneCountForTask, tapKey } from "./task-keys";
import { todayLocal } from "./today";

const today = todayLocal();

const TASK_EMOJI: Record<string, string> = {
  sing: "🎤",
  playWithTrack: "🎵",
  playWithoutTrack: "🎻",
};

const TASK_LABEL: Record<string, string> = {
  sing: "Sing",
  playWithTrack: "Play with track",
  playWithoutTrack: "Play without track",
};

export type TaskTypeDef = { type: string; play: boolean };

function taskKeyFor(task: { type: string; focus?: string }): string {
  return `${task.type}:${task.focus ?? ""}`;
}

export default function TaskList({
  trackId,
  tasks,
  taskTypes,
  initialDone,
}: {
  trackId: string;
  tasks: PlanTask[];
  taskTypes: TaskTypeDef[];
  initialDone: string[];
}) {
  const [done, setDone] = useState<string[]>(initialDone);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const track = useTrackedAction();

  async function advance(e: React.MouseEvent<HTMLButtonElement>, task: PlanTask) {
    if (pending.has(taskKeyFor(task))) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const currentDone = doneCountForTask(trackId, task, done);
    setPending((prev) => new Set(prev).add(taskKeyFor(task)));
    try {
      let next: string[];
      if (currentDone < task.count) {
        next = await track(toggleTask(today, tapKey(trackId, task, currentDone)));
      } else {
        let current = [...done];
        for (let i = 0; i < task.count; i++) {
          current = await track(toggleTask(today, tapKey(trackId, task, i)));
        }
        next = current;
      }
      setDone(next);
      const afterDone = doneCountForTask(trackId, task, next);
      if (afterDone === task.count) {
        setTimeout(() => {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: {
              x: (rect.left + rect.width / 2) / window.innerWidth,
              y: (rect.top + rect.height / 2) / window.innerHeight,
            },
          });
        }, 1000);
      }
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(taskKeyFor(task));
        return next;
      });
    }
  }

  return (
    <ul className="flex flex-wrap gap-2 mb-2">
      {tasks.map((task) => {
        const isValid = taskTypes.some((t) => t.type === task.type);
        const doneCount = doneCountForTask(trackId, task, done);
        const isFull = doneCount === task.count;
        const isPartial = doneCount > 0 && !isFull;
        const isPending = pending.has(taskKeyFor(task));
        const emoji = TASK_EMOJI[task.type] ?? "🎵";
        const stateIcon = !isValid ? emoji : isFull ? "✅" : doneCount === 0 ? "❌" : emoji;
        const bg = !isValid
          ? "bg-zinc-100 text-zinc-400"
          : isFull
            ? "bg-green-100 text-green-700"
            : isPartial
              ? "bg-amber-100 text-amber-700"
              : "bg-red-100 text-red-700 active:scale-95";
        return (
          <li key={taskKeyFor(task)}>
            <button
              onClick={(e) => advance(e, task)}
              disabled={isPending}
              className={`rounded-xl px-4 py-2 text-base font-medium transition-colors duration-1000 ${bg} ${isPending ? "opacity-60" : ""}`}
            >
              {stateIcon} {TASK_LABEL[task.type] ?? task.type}
              {task.focus ? ` · ${task.focus}` : ""}{" "}
              <span className="tabular-nums">
                {doneCount}/{task.count}
                {isPending && " …"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
