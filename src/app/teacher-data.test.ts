import { describe, it, expect } from "vitest";
import {
  addDays,
  datesInRange,
  computeTeacherWindow,
  noteKey,
  composeTeacherEmail,
} from "./teacher-data";

describe("addDays", () => {
  it("adds and subtracts days across month boundaries", () => {
    expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
    expect(addDays("2026-05-01", -1)).toBe("2026-04-30");
    expect(addDays("2026-04-17", 0)).toBe("2026-04-17");
  });
});

describe("datesInRange", () => {
  it("is inclusive and ordered", () => {
    expect(datesInRange("2026-04-15", "2026-04-17")).toEqual([
      "2026-04-15",
      "2026-04-16",
      "2026-04-17",
    ]);
  });

  it("is a single date when start === end", () => {
    expect(datesInRange("2026-04-15", "2026-04-15")).toEqual(["2026-04-15"]);
  });

  it("is empty when start > end", () => {
    expect(datesInRange("2026-04-17", "2026-04-15")).toEqual([]);
  });
});

describe("computeTeacherWindow", () => {
  it("spans the day after the last class through today (normal case)", () => {
    const schedule = {
      "2026-04-14": "individual-class",
      "2026-04-15": "3",
      "2026-04-16": "4",
      "2026-04-17": "4",
    };
    expect(computeTeacherWindow("2026-04-17", schedule)).toEqual({
      startDate: "2026-04-15",
      endDate: "2026-04-17",
      bounded: false,
    });
  });

  it("ends the day before today when today is itself a class day", () => {
    const schedule = {
      "2026-04-14": "individual-class",
      "2026-04-15": "3",
      "2026-04-16": "4",
      "2026-04-17": "group-class",
    };
    expect(computeTeacherWindow("2026-04-17", schedule)).toEqual({
      startDate: "2026-04-15",
      endDate: "2026-04-16",
      bounded: false,
    });
  });

  it("bounds to the most recent 14 days when no prior class day exists", () => {
    const schedule = { "2026-04-15": "3", "2026-04-16": "4" };
    expect(computeTeacherWindow("2026-04-17", schedule)).toEqual({
      startDate: "2026-04-04",
      endDate: "2026-04-17",
      bounded: true,
    });
  });

  it("bounds to the most recent 14 days when the last class day is far in the past", () => {
    // Mirrors the public demo seed: the only class day is back in 2020, so an
    // unbounded window would span ~6 years. It must bound to 14 days.
    const schedule = { "2020-01-07": "individual-class", "2026-06-01": "3" };
    expect(computeTeacherWindow("2026-06-05", schedule)).toEqual({
      startDate: "2026-05-23",
      endDate: "2026-06-05",
      bounded: true,
    });
  });

  it("does not bound when the last class day is within the 14-day cap", () => {
    const schedule = { "2026-05-26": "individual-class", "2026-05-27": "3" };
    expect(computeTeacherWindow("2026-06-05", schedule)).toEqual({
      startDate: "2026-05-27",
      endDate: "2026-06-05",
      bounded: false,
    });
  });
});

import {
  aggregateTeacherReport,
  formatLong,
  formatShort,
  type AggregateInput,
} from "./teacher-data";

describe("formatLong / formatShort", () => {
  it("formats dates without timezone drift", () => {
    expect(formatLong("2026-04-10")).toBe("April 10");
    expect(formatLong("2026-04-17")).toBe("April 17");
    expect(formatShort("2026-04-14")).toBe("Apr 14");
  });
});

describe("aggregateTeacherReport", () => {
  const tracks = [
    { id: "twinkle", name: "Twinkle", type: "audio" as const, file: null },
    { id: "scale", name: "A Major Scale", type: "reference" as const, file: null },
  ];

  it("sums targets and counts done keys per type across multiple dates", () => {
    const input: AggregateInput = {
      window: { startDate: "2026-04-15", endDate: "2026-04-16", bounded: false },
      schedule: { "2026-04-15": "1", "2026-04-16": "1" },
      plans: [
        {
          id: "1",
          createdDate: "2026-04-15",
          checklist: [],
          items: [
            {
              trackChoices: ["twinkle"],
              dice: false,
              tasks: [
                { type: "sing", count: 1 },
                { type: "playWithTrack", count: 2 },
              ],
            },
          ],
        },
      ],
      tracks,
      doneByDate: {
        "2026-04-15": ["twinkle-sing-0", "twinkle-playWithTrack-0"],
        "2026-04-16": ["twinkle-playWithTrack-0", "twinkle-playWithTrack-1"],
      },
      notesByDate: {},
    };

    const report = aggregateTeacherReport(input);
    expect(report).toEqual([
      {
        trackId: "twinkle",
        name: "Twinkle",
        progress: [
          { type: "sing", label: "Sing", done: 1, total: 2 },
          { type: "playWithTrack", label: "Play with track", done: 3, total: 4 },
        ],
        notes: [],
      },
    ]);
  });

  it("merges a track assigned in two plans across the window and adds targets", () => {
    const input: AggregateInput = {
      window: { startDate: "2026-04-15", endDate: "2026-04-16", bounded: false },
      schedule: { "2026-04-15": "1", "2026-04-16": "2" },
      plans: [
        { id: "1", createdDate: "2026-04-15", checklist: [], items: [
          { trackChoices: ["twinkle"], dice: false, tasks: [{ type: "sing", count: 3 }] } ] },
        { id: "2", createdDate: "2026-04-16", checklist: [], items: [
          { trackChoices: ["twinkle"], dice: false, tasks: [{ type: "sing", count: 3 }] } ] },
      ],
      tracks,
      doneByDate: { "2026-04-15": ["twinkle-sing-0", "twinkle-sing-1"] },
      notesByDate: {},
    };

    const report = aggregateTeacherReport(input);
    expect(report[0].progress).toEqual([
      { type: "sing", label: "Sing", done: 2, total: 6 },
    ]);
  });

  it("includes a track assigned but never practiced as 0/N", () => {
    const input: AggregateInput = {
      window: { startDate: "2026-04-15", endDate: "2026-04-15", bounded: false },
      schedule: { "2026-04-15": "1" },
      plans: [
        { id: "1", createdDate: "2026-04-15", checklist: [], items: [
          { trackChoices: ["scale"], dice: false, tasks: [{ type: "playWithoutTrack", count: 2 }] } ] },
      ],
      tracks,
      doneByDate: {},
      notesByDate: {},
    };

    const report = aggregateTeacherReport(input);
    expect(report).toEqual([
      {
        trackId: "scale",
        name: "A Major Scale",
        progress: [
          { type: "playWithoutTrack", label: "Play without track", done: 0, total: 2 },
        ],
        notes: [],
      },
    ]);
  });

  it("excludes focus tasks from the type aggregation", () => {
    const input: AggregateInput = {
      window: { startDate: "2026-04-15", endDate: "2026-04-15", bounded: false },
      schedule: { "2026-04-15": "1" },
      plans: [
        { id: "1", createdDate: "2026-04-15", checklist: [], items: [
          { trackChoices: ["twinkle"], dice: false, tasks: [
            { type: "playWithoutTrack", count: 2 },
            { type: "playWithoutTrack", count: 6, focus: "bars 5-8" },
          ] } ] },
      ],
      tracks,
      doneByDate: {
        "2026-04-15": ["twinkle-playWithoutTrack-0", "twinkle-playWithoutTrack:bars 5-8-0"],
      },
      notesByDate: {},
    };

    const report = aggregateTeacherReport(input);
    expect(report[0].progress).toEqual([
      { type: "playWithoutTrack", label: "Play without track", done: 1, total: 2 },
    ]);
  });

  it("attaches dated parent notes for the track in chronological order", () => {
    const input: AggregateInput = {
      window: { startDate: "2026-04-14", endDate: "2026-04-16", bounded: false },
      schedule: { "2026-04-14": "1", "2026-04-15": "1", "2026-04-16": "1" },
      plans: [
        { id: "1", createdDate: "2026-04-14", checklist: [], items: [
          { trackChoices: ["twinkle"], dice: false, tasks: [{ type: "sing", count: 1 }] } ] },
      ],
      tracks,
      doneByDate: {},
      notesByDate: {
        "2026-04-15": { twinkle: "much better" },
        "2026-04-14": { twinkle: "finger slipping on C string" },
      },
    };

    const report = aggregateTeacherReport(input);
    expect(report[0].notes).toEqual([
      { date: "2026-04-14", note: "finger slipping on C string" },
      { date: "2026-04-15", note: "much better" },
    ]);
  });
});

describe("noteKey", () => {
  it("joins trackId and date with a pipe", () => {
    expect(noteKey("twinkle", "2026-06-09")).toBe("twinkle|2026-06-09");
  });
});

describe("composeTeacherEmail", () => {
  const report = [
    {
      trackId: "twinkle",
      name: "Twinkle Twinkle",
      progress: [
        { type: "sing", label: "Sing", done: 3, total: 5 },
        { type: "playWithTrack", label: "Play with track", done: 2, total: 4 },
      ],
      notes: [
        { date: "2026-06-09", note: "bowing felt shaky" },
        { date: "2026-06-10", note: "much better today" },
      ],
    },
    {
      trackId: "minuet",
      name: "Minuet",
      progress: [{ type: "sing", label: "Sing", done: 1, total: 2 }],
      notes: [{ date: "2026-06-09", note: "forgot the repeat" }],
    },
  ];
  const names = { studentName: "Xiami", teacherName: "Mr. Graham" };

  it("includes only tracks with at least one selected note, in report order", () => {
    const selectedKeys = new Set([
      "twinkle|2026-06-09",
      "twinkle|2026-06-10",
      "minuet|2026-06-09",
    ]);
    expect(composeTeacherEmail({ report, selectedKeys, ...names })).toBe(
      [
        "Hi Mr. Graham,",
        "",
        "Twinkle Twinkle",
        "Sing 3/5 · Play with track 2/4",
        'Jun 9 — "bowing felt shaky"',
        'Jun 10 — "much better today"',
        "",
        "Minuet",
        "Sing 1/2",
        'Jun 9 — "forgot the repeat"',
        "",
        "Thanks!",
        "— Xiami",
      ].join("\n"),
    );
  });

  it("omits a track whose notes are all unselected", () => {
    const selectedKeys = new Set(["minuet|2026-06-09"]);
    const out = composeTeacherEmail({ report, selectedKeys, ...names });
    expect(out).not.toContain("Twinkle Twinkle");
    expect(out).toContain("Minuet");
  });

  it("includes only the selected notes within an included track", () => {
    const selectedKeys = new Set(["twinkle|2026-06-10"]);
    const out = composeTeacherEmail({ report, selectedKeys, ...names });
    expect(out).toContain('Jun 10 — "much better today"');
    expect(out).not.toContain("bowing felt shaky");
  });

  it("renders greeting + hint + sign-off when nothing is selected", () => {
    const out = composeTeacherEmail({
      report,
      selectedKeys: new Set(),
      ...names,
    });
    expect(out).toBe(
      [
        "Hi Mr. Graham,",
        "",
        "(Check notes below to add them to this email.)",
        "",
        "Thanks!",
        "— Xiami",
      ].join("\n"),
    );
  });

  it("omits the progress line for a selected track with no progress data", () => {
    const noProgress = [
      {
        trackId: "etude",
        name: "Etude",
        progress: [],
        notes: [{ date: "2026-06-09", note: "new piece" }],
      },
    ];
    const out = composeTeacherEmail({
      report: noProgress,
      selectedKeys: new Set(["etude|2026-06-09"]),
      ...names,
    });
    expect(out).toBe(
      [
        "Hi Mr. Graham,",
        "",
        "Etude",
        'Jun 9 — "new piece"',
        "",
        "Thanks!",
        "— Xiami",
      ].join("\n"),
    );
  });
});
