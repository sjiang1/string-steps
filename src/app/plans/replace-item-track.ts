import type { PracticeItem } from "../plans";

// Swap the track on the practice item at `index`, preserving its tasks, dice, and teacher note.
// Items hold a single-element pool until the dice feature (#5) adds multi-track editing.
export function replaceItemTrack(
  items: PracticeItem[],
  index: number,
  trackId: string,
): PracticeItem[] {
  return items.map((item, i) =>
    i === index ? { ...item, trackChoices: [trackId] } : item,
  );
}
