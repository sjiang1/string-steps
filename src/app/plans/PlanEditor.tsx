"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  TouchSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { primaryTrackId, type Plan, type Track } from "../plans";
import { savePlan } from "../actions";
import { isTaskError, validatePlan, type PlanValidationError } from "./plan-validation";
import { nextAvailableTrackId } from "../track-id";
import PracticeItemRow from "./PracticeItemRow";
import TrackPicker from "./TrackPicker";
import PrintPlanLink from "./PrintPlanLink";
import PlanActionBar from "./PlanActionBar";
import { addPoolTrack, removePoolTrack, replacePoolTrack } from "./replace-item-track";

const PROBLEM_MESSAGES: [PlanValidationError["reason"], string][] = [
  ["empty-focus", "Fill in every focus task\u2019s sub-part label."],
  ["duplicate", "Remove duplicate tasks (same action + sub-part)."],
  ["die-choices-count", "Give every die item 1\u20136 choices."],
  ["die-track-not-in-pool", "Die choices can only use tracks from the item\u2019s pool."],
  ["die-rhythm-unknown", "Remove die choices with unknown rhythms."],
  ["duplicate-pool-track", "Remove duplicate tracks from the item\u2019s pool."],
  ["rotation-per-day", "A rotating item must practice fewer tracks per day than its pool holds (at least 1)."],
  ["rotation-with-dice", "An item can rotate or use the die, not both."],
];

export default function PlanEditor({
  plan,
  tracks,
  frozen,
  printable = false,
}: {
  plan: Plan;
  tracks: Track[];
  frozen: boolean;
  /** Show the Print button (primary account only). */
  printable?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Plan>(plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<
    | null
    | { mode: "add" }
    | { mode: "add-to-pool"; index: number }
    | { mode: "replace-pool-track"; index: number; trackId: string }
  >(null);
  // Local copy of the catalog plus any not-yet-saved reference tracks created
  // inline ("add custom practice"). We don't router.refresh() to surface a new
  // track because that would reset the unsaved `draft` (see the effect that
  // syncs draft to the plan prop). Pending tracks are persisted by savePlan.
  const [trackList, setTrackList] = useState<Track[]>(tracks);
  const [pendingTrackIds, setPendingTrackIds] = useState<Set<string>>(new Set());

  const errors = useMemo(() => validatePlan(draft), [draft]);
  const invalidByTrack = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const e of errors) {
      if (!isTaskError(e)) continue;
      if (!map.has(e.trackId)) map.set(e.trackId, new Set());
      map.get(e.trackId)!.add(e.taskIndex);
    }
    return map;
  }, [errors]);

  useEffect(() => {
    setDraft(plan);
  }, [plan]);

  // A successful save refreshes the server props, so the once-pending tracks
  // now arrive in `tracks` — reset the local catalog and clear pending.
  useEffect(() => {
    setTrackList(tracks);
    setPendingTrackIds(new Set());
  }, [tracks]);

  function update(patch: Partial<Plan>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  // Apply the picked track to the current picker target: a new item, an
  // addition to an item's pool, or an in-place swap of one pooled track.
  function applyTrackToPlan(trackId: string) {
    if (picker?.mode === "add-to-pool") {
      update({ items: addPoolTrack(draft.items, picker.index, trackId) });
    } else if (picker?.mode === "replace-pool-track") {
      update({
        items: replacePoolTrack(draft.items, picker.index, picker.trackId, trackId),
      });
    } else {
      update({
        items: [...draft.items, { trackChoices: [trackId], tasks: [], dice: false }],
      });
    }
    setPicker(null);
  }

  // Create a media-less reference track inline from the picker. It's held
  // locally (pending) and only persisted to the catalog when the plan is saved.
  function onCreateReferenceTrack(name: string) {
    const id = nextAvailableTrackId(name, trackList.map((t) => t.id));
    const track: Track = { id, name, type: "reference", file: null };
    setTrackList((list) => [...list, track]);
    setPendingTrackIds((ids) => new Set(ids).add(id));
    applyTrackToPlan(id);
  }

  async function onSave() {
    if (errors.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      const newReferenceTracks = trackList.filter((t) => pendingTrackIds.has(t.id));
      await savePlan(draft, newReferenceTracks);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function onRevert() {
    setDraft(plan);
    setError(null);
  }

  const disabled = frozen || saving;
  // Edits live in `draft` until Save, and the print page reads the saved plan,
  // so printing an edited draft would silently print the old version.
  const unsaved = draft !== plan;

  // One human-readable line per kind of validation error, plus the last save
  // failure, shown behind the ⚠ in the action bar.
  const problems = useMemo(() => {
    const seen = new Set(errors.map((e) => e.reason));
    const messages = PROBLEM_MESSAGES.filter(([reason]) => seen.has(reason)).map(([, m]) => m);
    if (error) messages.push(error);
    return messages;
  }, [errors, error]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = draft.items.findIndex((i) => primaryTrackId(i) === active.id);
    const newIdx = draft.items.findIndex((i) => primaryTrackId(i) === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = [...draft.items];
    const [moved] = next.splice(oldIdx, 1);
    next.splice(newIdx, 0, moved);
    update({ items: next });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          Plan {draft.id}
          {draft.createdDate && <> · Created {draft.createdDate}</>}
          {frozen && (
            <span className="ml-2 rounded bg-zinc-200 px-2 py-0.5 text-xs">
              Frozen — already practiced or has a note
            </span>
          )}
        </p>
        {printable &&
          (unsaved ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="rounded-md border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-zinc-400">
                🖨 Print
              </span>
              <span className="text-xs text-zinc-500">Save first</span>
            </span>
          ) : (
            <PrintPlanLink planId={plan.id} />
          ))}
      </div>

      <label className="block">
        <span className="block text-sm font-medium mb-1">Description</span>
        <input
          type="text"
          value={draft.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
          disabled={disabled}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 disabled:bg-zinc-100"
          placeholder="Short description of this plan"
        />
      </label>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Items</h2>
        <DndContext
          id="plan-editor-items"
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={draft.items.map((i) => primaryTrackId(i))}
            strategy={verticalListSortingStrategy}
          >
            {draft.items.map((item, idx) => (
              <PracticeItemRow
                key={primaryTrackId(item)}
                item={item}
                tracks={trackList}
                disabled={disabled}
                invalidTaskIndices={invalidByTrack.get(primaryTrackId(item)) ?? new Set()}
                onChange={(next) =>
                  update({
                    items: draft.items.map((it, i) => (i === idx ? next : it)),
                  })
                }
                onAddTrack={() => setPicker({ mode: "add-to-pool", index: idx })}
                onReplaceTrack={(trackId) =>
                  setPicker({ mode: "replace-pool-track", index: idx, trackId })
                }
                onRemoveTrack={(trackId) =>
                  update({ items: removePoolTrack(draft.items, idx, trackId) })
                }
                onRemove={() =>
                  update({
                    items: draft.items.filter((_, i) => i !== idx),
                  })
                }
              />
            ))}
          </SortableContext>
        </DndContext>
        {draft.items.length === 0 && (
          <p className="text-sm text-zinc-500">No tracks yet.</p>
        )}
      </div>

      <PlanActionBar
        onAdd={() => setPicker({ mode: "add" })}
        onSave={onSave}
        onRevert={onRevert}
        disabled={disabled}
        saving={saving}
        problems={problems}
      />

      {picker && (
        <TrackPicker
          tracks={trackList}
          inPlan={
            picker.mode === "add"
              ? draft.items.map((i) => primaryTrackId(i))
              : draft.items[picker.index].trackChoices
          }
          heading={
            picker.mode === "add"
              ? "Add to plan"
              : picker.mode === "add-to-pool"
                ? "Add track to pool"
                : "Change track"
          }
          onClose={() => setPicker(null)}
          onPick={(t) => applyTrackToPlan(t.id)}
          onCreate={onCreateReferenceTrack}
        />
      )}
    </div>
  );
}
