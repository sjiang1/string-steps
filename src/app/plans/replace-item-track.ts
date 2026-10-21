import type { DieChoice, PracticeItem } from "../plans";

// Pool edits for the practice item at `index`, preserving its tasks, dice
// config, and teacher note. Die choices and per-track speeds referencing an
// edited track follow it: a replaced track carries them to the new id, a
// removed track drops them. A single-track item keeps its speed in `speed` and
// a pool in `trackSpeeds`, so growing to two tracks or shrinking to one moves
// the speed across. Callers enforce the min-1 pool size and no-duplicate rules.

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

// Puts `speeds` back on the item in the right field for its pool size.
function withSpeeds(item: PracticeItem, speeds: Record<string, number>): PracticeItem {
  const next: PracticeItem = { ...item };
  delete next.speed;
  delete next.trackSpeeds;
  if (next.trackChoices.length === 1) {
    const only = speeds[next.trackChoices[0]];
    if (only !== undefined) next.speed = only;
  } else if (Object.keys(speeds).length > 0) {
    next.trackSpeeds = speeds;
  }
  return next;
}

// The item's speeds keyed by track, whichever field holds them.
function speedsOf(item: PracticeItem): Record<string, number> {
  if (item.trackChoices.length === 1) {
    return item.speed !== undefined ? { [item.trackChoices[0]]: item.speed } : {};
  }
  return { ...item.trackSpeeds };
}

export function addPoolTrack(
  items: PracticeItem[],
  index: number,
  trackId: string,
): PracticeItem[] {
  return items.map((item, i) =>
    i === index
      ? withSpeeds({ ...item, trackChoices: [...item.trackChoices, trackId] }, speedsOf(item))
      : item,
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
    const speeds = speedsOf(item);
    if (oldTrackId in speeds) {
      speeds[newTrackId] = speeds[oldTrackId];
      delete speeds[oldTrackId];
    }
    return withSpeeds(
      {
        ...item,
        trackChoices: item.trackChoices.map((t) => (t === oldTrackId ? newTrackId : t)),
        ...(item.dieChoices && {
          dieChoices: rewriteDieChoices(item.dieChoices, oldTrackId, newTrackId),
        }),
      },
      speeds,
    );
  });
}

export function removePoolTrack(
  items: PracticeItem[],
  index: number,
  trackId: string,
): PracticeItem[] {
  return items.map((item, i) => {
    if (i !== index) return item;
    const speeds = speedsOf(item);
    delete speeds[trackId];
    return withSpeeds(
      {
        ...item,
        trackChoices: item.trackChoices.filter((t) => t !== trackId),
        ...(item.dieChoices && {
          dieChoices: rewriteDieChoices(item.dieChoices, trackId, null),
        }),
      },
      speeds,
    );
  });
}
