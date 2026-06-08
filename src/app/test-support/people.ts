// Shared test fixtures for student/teacher data.
//
// These are derived from the committed fictional seeds (data/students.json,
// data/teacher.json) so there is a single source of truth: tests and the shipped
// public template can never drift apart. If the seed changes, every test that
// references a student/teacher follows automatically.
//
// Import these in any test that needs people data instead of hardcoding names.
import studentsSeed from "@data/students.json";
import teacherSeed from "@data/teacher.json";
import { findPrimary, type Student } from "../students";

export const TEST_STUDENTS: Student[] = studentsSeed as Student[];
export const TEST_PRIMARY: Student = findPrimary(TEST_STUDENTS);
export const TEST_TEACHER: { name: string } = teacherSeed;

// TEST_LINKED is a STANDALONE fixture, NOT derived from the seed: the public
// template ships a single (primary) student by default (#37), so the seed has
// no linked entry. The linked-account behavior still needs coverage, so define
// a linked student here. linkedTo references the seed's primary so the
// relationship stays valid.
export const TEST_LINKED: Student = {
  id: "mama-bear",
  name: "Mama Bear",
  emoji: "🐻",
  kind: "linked",
  linkedTo: TEST_PRIMARY.id,
};
