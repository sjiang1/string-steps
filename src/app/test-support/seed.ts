// Independent test fixtures for actions/plans behavioral tests.
//
// Deliberately NOT derived from the committed data/*.json seed: those files are
// the public *demo* content (a single plan) and change independently, so tests
// that asserted against them (e.g. getMonthProgress task totals) would break on
// every seed tweak. Pass these to the setup*Data helpers instead of assuming the
// committed seed's shape.
//
// (Contrast with test-support/people.ts, which DOES derive from the committed
// students/teacher seed because those are a single fictional source of truth.)
import type { Plan } from "../plans";

export const TEST_PLANS: Plan[] = [
  {
    id: "1",
    createdDate: "2026-04-07",
    items: [
      { trackId: "demo-a", tasks: [{ type: "playWithTrack", count: 2 }], dice: false },
      { trackId: "demo-b", tasks: [{ type: "playWithoutTrack", count: 1 }], dice: false },
    ],
    checklist: [],
  },
];

// Sum of task counts in TEST_PLANS[0] — keep getMonthProgress assertions in sync.
export const TEST_PLAN_TASK_TOTAL = 3;
