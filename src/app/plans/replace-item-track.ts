import type { DieChoice, PracticeItem } from "../plans";

// Pool edits for the practice item at `index`, preserving its tasks, dice
// config, and teacher note. Die choices referencing an edited track follow it:
// a replaced track rewrites matching choices to the new id, a removed track
// drops them. Callers enforce the min-1 pool size and no-duplicate rules.

function rewriteDieChoices(
  dieChoices: DieChoice[],
  oldId: string,
  newId: string | null,
): DieChoice[] {
  if (newId === null) {
    return dieChoices.filter((c) => !(c.kind === "track" && c.trackId === oldId));
  }
  return dieChoices.map((c) =>
    c.kind === "track" && c.trackId === oldId ? { ...c, trackId: newId } : c,
  );
}

export function addPoolTrack(
  items: PracticeItem[],
  index: number,
  trackId: string,
): PracticeItem[] {
  return items.map((item, i) =>
    i === index ? { ...item, trackChoices: [...item.trackChoices, trackId] } : item,
  );
}

export function replacePoolTrack(
  items: PracticeItem[],
  index: number,
  oldTrackId: string,
  newTrackId: string,
): PracticeItem[] {
  return items.map((item, i) => {
    if (i !== index) return item;
    return {
      ...item,
      trackChoices: item.trackChoices.map((t) => (t === oldTrackId ? newTrackId : t)),
      ...(item.dieChoices && {
        dieChoices: rewriteDieChoices(item.dieChoices, oldTrackId, newTrackId),
      }),
    };
  });
}

export function removePoolTrack(
  items: PracticeItem[],
  index: number,
  trackId: string,
): PracticeItem[] {
  return items.map((item, i) => {
    if (i !== index) return item;
    return {
      ...item,
      trackChoices: item.trackChoices.filter((t) => t !== trackId),
      ...(item.dieChoices && {
        dieChoices: rewriteDieChoices(item.dieChoices, trackId, null),
      }),
    };
  });
}
