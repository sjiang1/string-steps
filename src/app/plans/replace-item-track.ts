import type { PracticeItem } from "../plans";

// Swap the track on the practice item at `index`, preserving its tasks, dice, and teacher note.
export function replaceItemTrack(
  items: PracticeItem[],
  index: number,
  trackId: string,
): PracticeItem[] {
  return items.map((item, i) => (i === index ? { ...item, trackId } : item));
}
