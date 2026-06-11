"use client";

import { useMemo, useState } from "react";
import {
  composeTeacherEmail,
  formatShort,
  noteKey,
  type TrackReport,
} from "../teacher-data";

export default function TeacherEmailBuilder({
  report,
  studentName,
  teacherName,
}: {
  report: TrackReport[];
  studentName: string;
  teacherName: string;
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  function toggle(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setCopied("idle");
  }

  const draft = useMemo(
    () => composeTeacherEmail({ report, selectedKeys, studentName, teacherName }),
    [report, selectedKeys, studentName, teacherName],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <ul className="space-y-4">
        {report.map((entry) => (
          <li key={entry.trackId} className="rounded-lg border bg-white p-4">
            <div className="font-semibold mb-1">{entry.name}</div>
            <div className="text-sm text-zinc-600">
              {entry.progress.map((p, i) => (
                <span key={p.type}>
                  {i > 0 && " · "}
                  {p.label} {p.done}/{p.total}
                </span>
              ))}
            </div>
            {entry.notes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {entry.notes.map((n) => {
                  const key = noteKey(entry.trackId, n.date);
                  return (
                    <li key={n.date}>
                      <label className="flex items-start gap-3 text-sm italic text-zinc-500">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(key)}
                          onChange={() => toggle(key)}
                          className="mt-1 h-5 w-5 shrink-0"
                        />
                        <span>
                          {formatShort(n.date)} — “{n.note}”
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
        {report.length === 0 && (
          <li className="text-zinc-500">
            No tracks were scheduled in this window.
          </li>
        )}
      </ul>

      <div className="space-y-3">
        <h2 className="font-semibold">✉️ Email draft</h2>
        <textarea
          readOnly
          value={draft}
          rows={16}
          className="w-full resize-none rounded-lg border border-zinc-200 bg-white p-3 font-mono text-sm"
        />
        <button
          onClick={copy}
          className="rounded-lg bg-blue-600 px-5 py-3 text-base font-semibold text-white hover:bg-blue-700"
        >
          {copied === "ok"
            ? "Copied! ✅"
            : copied === "fail"
              ? "Copy failed — select and copy manually."
              : "📋 Copy to clipboard"}
        </button>
      </div>
    </div>
  );
}
