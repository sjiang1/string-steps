import { describe, it, expect } from "vitest";
import { doneLogId, findPrimary } from "./students";
import { TEST_PRIMARY, TEST_LINKED } from "./test-support/people";

describe("findPrimary", () => {
  it("returns the entry with kind === 'primary'", () => {
    expect(findPrimary([TEST_PRIMARY, TEST_LINKED])).toEqual(TEST_PRIMARY);
  });
  it("throws when no primary student exists", () => {
    expect(() => findPrimary([TEST_LINKED])).toThrow("No primary student configured");
  });
});

describe("doneLogId", () => {
  it("returns the bare date for a primary student", () => {
    expect(doneLogId(TEST_PRIMARY, "2026-05-22")).toBe("2026-05-22");
  });
  it("returns a composite key for a linked student", () => {
    expect(doneLogId(TEST_LINKED, "2026-05-22")).toBe(`2026-05-22:${TEST_LINKED.id}`);
  });
});
