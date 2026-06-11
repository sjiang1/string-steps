import { isClassDay } from "./day-types";
import type { Plan, PlanSchedule, Track } from "./plans";
import { doneCountForTask } from "./task-keys";

export type TeacherWindow = {
  startDate: string;
  endDate: string;
  // True when the window was bounded to the most recent MAX_WINDOW_DAYS because
  // there was no usable recent class-day anchor (none at all, or one so old the
  // natural window would balloon). False for a normal "since last class" window.
  bounded: boolean;
};

export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function datesInRange(startDate: string, endDate: string): string[] {
  if (startDate > endDate) return [];
  const out: string[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) out.push(d);
  return out;
}

// The report normally spans the day after the last class day through endDate.
// When there's no usable recent class-day anchor — none at all, or one so old
// the window would balloon (e.g. the demo seed's lone 2020 class day, which
// would otherwise produce a ~6-year range iterating thousands of dates) — bound
// it to the most recent MAX_WINDOW_DAYS instead. One bounded path serves both.
const MAX_WINDOW_DAYS = 14;

export function computeTeacherWindow(
  today: string,
  schedule: PlanSchedule,
): TeacherWindow {
  let lastClass: string | null = null;
  for (const [date, value] of Object.entries(schedule)) {
    if (date < today && isClassDay(value)) {
      if (lastClass === null || date > lastClass) lastClass = date;
    }
  }

  const todayIsClass = isClassDay(schedule[today] ?? "");
  const endDate = todayIsClass ? addDays(today, -1) : today;

  const earliestStart = addDays(endDate, -(MAX_WINDOW_DAYS - 1));
  const sinceClass = lastClass !== null ? addDays(lastClass, 1) : null;
  if (sinceClass === null || sinceClass < earliestStart) {
    return { startDate: earliestStart, endDate, bounded: true };
  }
  return { startDate: sinceClass, endDate, bounded: false };
}

const TYPE_ORDER = ["sing", "playWithTrack", "playWithoutTrack"] as const;
const TYPE_LABEL: Record<string, string> = {
  sing: "Sing",
  playWithTrack: "Play with track",
  playWithoutTrack: "Play without track",
};

export type TaskTypeProgress = {
  type: string;
  label: string;
  done: number;
  total: number;
};

export type TrackNoteEntry = { date: string; note: string };

export type TrackReport = {
  trackId: string;
  name: string;
  progress: TaskTypeProgress[];
  notes: TrackNoteEntry[];
};

export type AggregateInput = {
  window: TeacherWindow;
  schedule: PlanSchedule;
  plans: Plan[];
  tracks: Track[];
  doneByDate: Record<string, string[]>;
  notesByDate: Record<string, Record<string, string>>;
};

function fmt(date: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
    ...opts,
    timeZone: "UTC",
  });
}

export function formatLong(date: string): string {
  return fmt(date, { month: "long", day: "numeric" });
}

export function formatShort(date: string): string {
  return fmt(date, { month: "short", day: "numeric" });
}

export function aggregateTeacherReport(input: AggregateInput): TrackReport[] {
  const { window, schedule, plans, tracks, doneByDate, notesByDate } = input;
  const dates = datesInRange(window.startDate, window.endDate);

  const order: string[] = [];
  // trackId -> type -> summed target count (regular tasks only)
  const targets = new Map<string, Map<string, number>>();

  for (const date of dates) {
    const planId = schedule[date];
    if (planId === undefined) continue;
    const plan = plans.find((p) => p.id === planId);
    if (plan === undefined) continue; // class/sick ids never match a plan id

    for (const item of plan.items) {
      if (!targets.has(item.trackId)) {
        targets.set(item.trackId, new Map());
        order.push(item.trackId);
      }
      const byType = targets.get(item.trackId)!;
      for (const task of item.tasks) {
        if (task.focus !== undefined) continue; // focus tasks excluded
        byType.set(task.type, (byType.get(task.type) ?? 0) + task.count);
      }
    }
  }

  return order.map((trackId) => {
    const byType = targets.get(trackId)!;
    const progress: TaskTypeProgress[] = TYPE_ORDER.filter(
      (type) => (byType.get(type) ?? 0) > 0,
    ).map((type) => {
      const total = byType.get(type)!;
      let done = 0;
      for (const date of dates) {
        done += doneCountForTask(
          trackId,
          { type, count: 0 },
          doneByDate[date] ?? [],
        );
      }
      return { type, label: TYPE_LABEL[type] ?? type, done, total };
    });

    const notes: TrackNoteEntry[] = [];
    for (const date of dates) {
      const note = notesByDate[date]?.[trackId];
      if (note !== undefined) notes.push({ date, note });
    }

    const name = tracks.find((t) => t.id === trackId)?.name ?? trackId;
    return { trackId, name, progress, notes };
  });
}

export type ComposeInput = {
  report: TrackReport[];
  selectedKeys: Set<string>;
  studentName: string;
  teacherName: string;
};

export function noteKey(trackId: string, date: string): string {
  return `${trackId}|${date}`;
}

export function composeTeacherEmail(input: ComposeInput): string {
  const { report, selectedKeys, studentName, teacherName } = input;
  const sections: string[] = [`Hi ${teacherName},`];

  const blocks: string[] = [];
  for (const track of report) {
    const selectedNotes = track.notes.filter((n) =>
      selectedKeys.has(noteKey(track.trackId, n.date)),
    );
    if (selectedNotes.length === 0) continue;

    const lines: string[] = [track.name];
    if (track.progress.length > 0) {
      lines.push(
        track.progress.map((p) => `${p.label} ${p.done}/${p.total}`).join(" · "),
      );
    }
    for (const n of selectedNotes) {
      lines.push(`${formatShort(n.date)} — "${n.note}"`);
    }
    blocks.push(lines.join("\n"));
  }

  if (blocks.length === 0) {
    sections.push("(Check notes below to add them to this email.)");
  } else {
    sections.push(...blocks);
  }

  sections.push(`Thanks!\n— ${studentName}`);
  return sections.join("\n\n");
}
