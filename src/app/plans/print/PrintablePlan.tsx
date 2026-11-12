import { itemDisplayName, trackPlaybackSpeed, type DieChoice, type Plan, type PlanTask, type PracticeItem, type Track } from "../../plans";
import { rhythmById } from "../../rhythms";
import { isRotating } from "../../rotation";

export type PrintChecklistItem = { id: string; emoji: string; description: string };

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

// "Tuesday, November 10, 2026". The seed plan has an empty createdDate; show nothing for it.
export function formatCreatedDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function taskLine(task: PlanTask): string {
  const base = `${TASK_EMOJI[task.type] ?? ""} ${TASK_LABEL[task.type] ?? task.type} ×${task.count}`;
  return task.focus !== undefined ? `${base} — ${task.focus}` : base;
}

function dieChoiceLabel(choice: DieChoice, tracks: Track[]): string {
  if (choice.kind === "rhythm") {
    const r = rhythmById(choice.rhythmId);
    return r ? `${r.emoji} ${r.label}` : choice.rhythmId;
  }
  return tracks.find((t) => t.id === choice.trackId)?.name ?? choice.trackId;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="my-0.5 flex gap-1">
      <span className="w-16 shrink-0 text-zinc-600">{label}</span>
      <span>{children}</span>
    </p>
  );
}

function TrackName({ item, trackId, tracks }: { item: PracticeItem; trackId: string; tracks: Track[] }) {
  const track = tracks.find((t) => t.id === trackId);
  const speed = trackPlaybackSpeed(item, trackId, tracks);
  return (
    <span className="whitespace-nowrap">
      {track?.name ?? trackId}
      {speed !== null && speed !== 1 && ` (${speed}×)`}
      {track?.type === "video" && (
        <span className="ml-1 rounded border border-zinc-400 px-1 text-[10px] uppercase text-zinc-600 align-middle">
          video
        </span>
      )}
    </span>
  );
}

export default function PrintablePlan({
  plan,
  tracks,
  checklist,
  studentName,
}: {
  plan: Plan;
  tracks: Track[];
  checklist: PrintChecklistItem[];
  studentName: string;
}) {
  const created = formatCreatedDate(plan.createdDate);
  const description = plan.description?.trim();
  return (
    <article className="mx-auto max-w-[7.5in] bg-white p-8 font-serif text-[13px] leading-snug text-zinc-900 print:p-0">
      <header className="mb-4">
        <h1 className="text-xl font-bold">{studentName}&apos;s practice plan</h1>
        {description && <p className="text-base">{description}</p>}
        {created && <p className="text-xs text-zinc-600">Created {created}</p>}
      </header>

      {checklist.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Get ready</h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {checklist.map((c) => (
              <li key={c.id}>
                {c.emoji} {c.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 id="practice-items" className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
          Practice items
        </h2>
        <ol aria-labelledby="practice-items" className="list-none p-0">
          {plan.items.map((item, i) => (
            <li
              key={`${item.trackChoices[0]}-${i}`}
              className="grid grid-cols-[1fr_42%] gap-3 border-t border-zinc-300 py-2.5 break-inside-avoid"
            >
              <div>
                <h3 className="text-[15px] font-bold">
                  {i + 1}. {itemDisplayName(item, tracks)}
                </h3>
                <Row label="Tracks">
                  {item.trackChoices.map((id, j) => (
                    <span key={id}>
                      {j > 0 && " · "}
                      <TrackName item={item} trackId={id} tracks={tracks} />
                    </span>
                  ))}
                </Row>
                {isRotating(item) && (
                  <Row label="Rotate">
                    {item.perDay} of {item.trackChoices.length} per day
                  </Row>
                )}
                {item.tasks.length > 0 && (
                  <Row label="Tasks">
                    {item.tasks.map((t, j) => (
                      <span key={j} className="mr-3.5 inline-block">
                        {taskLine(t)}
                      </span>
                    ))}
                  </Row>
                )}
                {item.dice && item.dieChoices && item.dieChoices.length > 0 && (
                  <Row label="🎲 Die">
                    {item.dieChoices.map((c, j) => `${j + 1} ${dieChoiceLabel(c, tracks)}`).join(" · ")}
                  </Row>
                )}
                {item.teacherNote && <p className="my-0.5 italic text-zinc-700">{item.teacherNote}</p>}
              </div>
              <div
                aria-hidden="true"
                className="border-l border-dashed border-zinc-400 pl-2.5 text-[10px] text-zinc-400"
              >
                notes
              </div>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
