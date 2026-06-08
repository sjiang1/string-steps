"use client";

import { dayTypes } from "../day-types";

export default function DaySheet({
  date,
  currentDayTypeId,
  onApply,
  onClose,
}: {
  date: string; // "YYYY-MM-DD"
  currentDayTypeId: string | null;
  onApply: (dayTypeId: string | null) => void;
  onClose: () => void;
}) {
  const heading = new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="w-full max-w-md rounded-t-lg bg-white p-4 sm:rounded-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{heading}</h3>
          <button onClick={onClose} aria-label="Close" className="text-zinc-500">
            ×
          </button>
        </div>

        <ul className="space-y-1">
          {dayTypes.map((t) => {
            const current = t.id === currentDayTypeId;
            return (
              <li key={t.id}>
                <button
                  onClick={() => onApply(current ? null : t.id)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left hover:bg-zinc-50"
                >
                  <span className="text-xl">{t.emoji}</span>
                  <span>{t.label}</span>
                  {current && (
                    <span className="ml-auto text-sm text-green-600">✓ tap to clear</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-xs text-zinc-500">
          Days you don&rsquo;t label become a normal practice day when that day arrives.
        </p>
      </div>
    </div>
  );
}
