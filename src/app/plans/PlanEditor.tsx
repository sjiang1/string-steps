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
import { isTaskError, validatePlan } from "./plan-validation";
import { nextAvailableTrackId } from "../track-id";
import PracticeItemRow from "./PracticeItemRow";
import TrackPicker from "./TrackPicker";
import { addPoolTrack, removePoolTrack, replacePoolTrack } from "./replace-item-track";

export default function PlanEditor({
  plan,
  tracks,
  frozen,
}: {
  plan: Plan;
  tracks: Track[];
  frozen: boolean;
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
      <p className="text-sm text-zinc-500">
        Plan {draft.id}
        {draft.createdDate && <> · Created {draft.createdDate}</>}
        {frozen && (
          <span className="ml-2 rounded bg-zinc-200 px-2 py-0.5 text-xs">
            Frozen — already practiced or has a note
          </span>
        )}
      </p>

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
        <button
          onClick={() => setPicker({ mode: "add" })}
          disabled={disabled}
          className="rounded-md border border-dashed border-zinc-400 px-4 py-2 text-sm disabled:text-zinc-300"
        >
          + Add practice
        </button>
      </div>

      {errors.length > 0 && (
        <p className="text-sm text-red-600">
          {errors.some((e) => e.reason === "empty-focus") && (
            <span>Fill in every focus task&rsquo;s sub-part label. </span>
          )}
          {errors.some((e) => e.reason === "duplicate") && (
            <span>Remove duplicate tasks (same action + sub-part). </span>
          )}
          {errors.some((e) => e.reason === "die-choices-count") && (
            <span>Give every die item 1–6 choices. </span>
          )}
          {errors.some((e) => e.reason === "die-track-not-in-pool") && (
            <span>Die choices can only use tracks from the item&rsquo;s pool. </span>
          )}
          {errors.some((e) => e.reason === "die-rhythm-unknown") && (
            <span>Remove die choices with unknown rhythms. </span>
          )}
          {errors.some((e) => e.reason === "duplicate-pool-track") && (
            <span>Remove duplicate tracks from the item&rsquo;s pool.</span>
          )}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={disabled || errors.length > 0}
          className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:bg-zinc-300"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onRevert}
          disabled={disabled}
          className="rounded-md border border-zinc-300 px-4 py-2 disabled:text-zinc-400"
        >
          Revert
        </button>
      </div>

      {error && <p className="text-red-600">{error}</p>}

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
