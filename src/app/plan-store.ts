// plan:all — plan id → Plan, as a Redis hash; plan:next-id — the counter new
// ids come from. Empty in Redis on a fresh deployment, so data/plans.json (an
// object keyed by id, the same shape) seeds the hash. In dev that file is the
// store and the next id is derived from it, since dev has one writer.
import plansSeed from "@data/plans.json";
import type { Plan } from "./plans";
import {
  dataPath,
  hashSeedIfEmpty,
  hashSet,
  hashSetIfAbsent,
  jsonCodec,
  nextId,
  type FileRef,
} from "./storage";

const PLANS_KEY = "plan:all";
const NEXT_ID_KEY = "plan:next-id";
const codec = jsonCodec<Plan>();
const fileRef = (): FileRef => ({ path: dataPath("PLANS_JSON_PATH", "plans.json") });

// Raw plans; actions.ts applies normalizePlans for legacy item shapes.
export async function getPlanMap(): Promise<Record<string, Plan>> {
  return hashSeedIfEmpty(PLANS_KEY, fileRef(), codec, plansSeed as unknown as Record<string, Plan>);
}

export async function putPlan(plan: Plan): Promise<void> {
  await hashSet(PLANS_KEY, fileRef(), codec, plan.id, plan);
}

async function maxNumericIdPlusOne(): Promise<number> {
  const ids = Object.keys(await getPlanMap())
    .map((id) => parseInt(id, 10))
    .filter((n) => !isNaN(n));
  return (ids.length === 0 ? -1 : Math.max(...ids)) + 1;
}

// Takes the next id from the counter and writes the plan under it. An id that
// already exists (a plan added by hand in the console, or a fresh deployment
// whose counter starts below the seed) is skipped and the next one tried, so
// no existing plan is ever overwritten.
export async function createPlanWithNewId(plan: Omit<Plan, "id">): Promise<Plan> {
  for (;;) {
    const id = String(await nextId(NEXT_ID_KEY, maxNumericIdPlusOne));
    const candidate: Plan = { ...plan, id };
    if (await hashSetIfAbsent(PLANS_KEY, fileRef(), codec, id, candidate)) return candidate;
  }
}
