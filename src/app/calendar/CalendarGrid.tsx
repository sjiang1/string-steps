"use client";

import { useState } from "react";
import type { MonthProgressEntry } from "../actions";
import { setDayType } from "../actions";
import { getDayType } from "../day-types";
import DaySheet from "./DaySheet";

type Props = {
  initialYear: number;
  initialMonth: number; // 0-indexed (0 = January)
  progress: Record<string, MonthProgressEntry>;
  today: string; // "YYYY-MM-DD"
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function yearMonthKey(year: number, month: number): string {
  return `${year}-${pad(month + 1)}`;
}

function DayCell({
  day,
  entry,
  isToday,
  isFuture,
  tappable,
  onClick,
}: {
  day: number;
  entry: MonthProgressEntry | undefined;
  isToday: boolean;
  isFuture: boolean;
  tappable: boolean;
  onClick: () => void;
}) {
  let bg = "bg-zinc-100 text-zinc-400";
  let label: string | null = null;

  if (entry) {
    if (entry.type === "non-practice") {
      const dayType = getDayType(entry.dayTypeId);
      if (dayType) {
        bg = `${dayType.bgClass} ${dayType.textClass}`;
        label = dayType.emoji;
      }
    } else if (entry.type === "practice") {
      if (entry.done === 0) {
        bg = "bg-red-50 text-red-700";
      } else if (entry.done >= entry.total) {
        bg = "bg-green-100 text-green-700";
        label = `\u2713 ${entry.done}/${entry.total}`;
      } else {
        bg = "bg-amber-100 text-amber-700";
        label = `${entry.done}/${entry.total}`;
      }
    }
  }

  const ring = isToday ? "ring-2 ring-blue-500" : "";
  const muted = isFuture ? "opacity-50" : "";
  const cursor = tappable ? "cursor-pointer hover:brightness-95" : "";

  return (
    <button
      type="button"
      disabled={!tappable}
      onClick={onClick}
      className={`rounded py-1.5 flex flex-col items-center justify-center text-xs ${bg} ${ring} ${muted} ${cursor} disabled:cursor-default`}
    >
      <span className="font-medium">{day}</span>
      {label && <span className="text-[11px] leading-tight">{label}</span>}
    </button>
  );
}

export default function CalendarGrid({ initialYear, initialMonth, progress: initialProgress, today }: Props) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [progress, setProgress] = useState(initialProgress);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);

  async function navigate(dir: -1 | 1) {
    let newMonth = month + dir;
    let newYear = year;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setYear(newYear);
    setMonth(newMonth);
    setLoading(true);

    const ym = yearMonthKey(newYear, newMonth);
    const res = await fetch(`/api/calendar?month=${ym}`);
    const data = await res.json();
    setProgress(data);
    setLoading(false);
  }

  async function applyDayType(dayTypeId: string | null) {
    if (!picking) return;
    await setDayType(picking, dayTypeId);
    const ym = yearMonthKey(year, month);
    const res = await fetch(`/api/calendar?month=${ym}`);
    setProgress(await res.json());
    setPicking(null);
  }

  function currentDayTypeId(date: string): string | null {
    const entry = progress[date];
    return entry && entry.type === "non-practice" ? entry.dayTypeId : null;
  }

  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfWeek(year, month);

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate(-1)} className="text-xl px-3 py-1 text-zinc-500 hover:text-zinc-800">
          &larr;
        </button>
        <h2 className="text-lg font-semibold">
          {MONTH_NAMES[month]} {year}
        </h2>
        <button onClick={() => navigate(1)} className="text-xl px-3 py-1 text-zinc-500 hover:text-zinc-800">
          &rarr;
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-zinc-500">
            {d}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-7 gap-1 ${loading ? "opacity-50" : ""}`}>
        {Array.from({ length: startDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: totalDays }).map((_, i) => {
          const day = i + 1;
          const date = dateKey(year, month, day);
          const isFuture = date > today;
          return (
            <DayCell
              key={day}
              day={day}
              entry={progress[date]}
              isToday={date === today}
              isFuture={isFuture}
              tappable={date >= today}
              onClick={() => setPicking(date)}
            />
          );
        })}
      </div>

      {picking && (
        <DaySheet
          date={picking}
          currentDayTypeId={currentDayTypeId(picking)}
          onApply={applyDayType}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
