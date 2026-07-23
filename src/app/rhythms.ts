import rhythmsData from "@data/dice-rhythms.json";

export type Rhythm = {
  id: string;
  face: number;
  emoji: string;
  label: string;
};

// The six practice rhythms, in face order (face N = index N-1).
export const rhythms = rhythmsData as Rhythm[];

export function rhythmById(id: string): Rhythm | undefined {
  return rhythms.find((r) => r.id === id);
}
