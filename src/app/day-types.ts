import dayTypesData from "@data/day-types.json";

export type DayType = {
  id: string;
  label: string;
  emoji: string;
  bgClass: string;
  textClass: string;
  isClassDay?: boolean;
  // The Teacher page reports everything since the most recent day of a type
  // with this flag. Group classes are class days but are not reported at.
  anchorsTeacherReport?: boolean;
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

export function anchorsTeacherReport(id: string): boolean {
  return getDayType(id)?.anchorsTeacherReport === true;
}
