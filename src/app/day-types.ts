import dayTypesData from "@data/day-types.json";

export type DayType = {
  id: string;
  label: string;
  emoji: string;
  bgClass: string;
  textClass: string;
  isClassDay?: boolean;
};

export const dayTypes: DayType[] = dayTypesData;

export function getDayType(id: string): DayType | undefined {
  return dayTypes.find((t) => t.id === id);
}

export function isNonPracticeDay(value: string): boolean {
  return dayTypes.some((t) => t.id === value);
}

export function isClassDay(id: string): boolean {
  return getDayType(id)?.isClassDay === true;
}
