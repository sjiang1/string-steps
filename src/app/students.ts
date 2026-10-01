export type Student = {
  id: string;
  name: string;
  emoji: string;
  kind: "primary" | "linked";
  linkedTo?: string;
  /** Primary student only: signs the teacher email alongside the student. */
  parentName?: string;
};

export function findPrimary(students: Student[]): Student {
  const primary = students.find((s) => s.kind === "primary");
  if (!primary) throw new Error("No primary student configured");
  return primary;
}

export function doneLogId(student: Student, date: string): string {
  return student.kind === "primary" ? date : `${date}:${student.id}`;
}
