const TIMEZONE = "America/New_York";

export function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}
