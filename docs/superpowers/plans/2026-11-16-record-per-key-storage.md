# Store Each Record On Its Own — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, per Siyuan's standing preference) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-JSON-value-per-collection Redis layout with a hash or set per collection so no write can erase another writer's record, with a one-step migration script.

**Architecture:** `storage.ts` gains codec-aware hash and set helpers over a second, non-deserialising Upstash client, each with a JSON-file fallback for dev. Each collection moves into its own module (`practice-log.ts`, `notes.ts`, `track-blobs.ts`, `tracks.ts`, `schedule.ts`, `plan-store.ts`); `actions.ts` keeps every exported action and signature and delegates. New key names sit beside the old ones; `scripts/migrate-storage.mjs` copies old to new without overwriting.

**Tech Stack:** Next.js 16 app router, `@upstash/redis` 1.37, Vitest 4, Node 22 ESM scripts.

**Spec:** `docs/superpowers/specs/2026-11-16-record-per-key-storage-design.md`

**Branch:** `44-store-each-record-on-its-own` (already exists; carries `vercel.json` that disables Vercel builds for this branch — removed in the last task).

## Global Constraints

- New key names exactly as the spec's table: `done:<logId>`, `note:<date>`, `track:blob`, `track:all`, `plan:all`, `plan:next-id`, `schedule:day`. Old keys are never read, written, or deleted by app code.
- `students:list`, `teacher:info`, `checklist:blobs` keep `readJson`/`writeJson` and the existing auto-deserialising `redis` client.
- New helpers use `redisRaw` (`automaticDeserialization: false`) and always pass strings produced by a `Codec<T>`; never pass an object to a hash write.
- `stringCodec` for notes, blob URLs, schedule values, set members. `jsonCodec<T>()` for Track and Plan values.
- Dev fallback: hash → JSON object, set → JSON array of strings; `FileRef.slot` selects one top-level property of the file; an emptied slot is removed from the file. Dev files store plain JSON values, not codec output.
- `HGETALL` on a missing/empty hash returns `null` in `@upstash/redis`; helpers return `{}`.
- Every export of `actions.ts` keeps its name, parameters, and return type. Collection modules are not `"use server"`.
- `data/tracks.json` and `data/plans.json` become objects keyed by id. `data/practice-log.json` and `data/notes-log.json` keep their shape.
- Existing env-var overrides stay: `PRACTICE_LOG_PATH`, `NOTES_LOG_PATH`, `PLANS_JSON_PATH`, `SCHEDULE_JSON_PATH`, `TRACKS_JSON_PATH`, `TRACK_BLOBS_JSON_PATH`.
- Migration writes with `HSETNX`/`SADD` only; `plan:next-id` set only when the computed maximum is higher than the stored counter. Duplicate ids: first entry wins.
- Commit messages describe how the touched files relate, not just what was added. Each task ends with `npm test` green (baseline 403 tests) and `npm run typecheck` clean.

## Review Focus

1. A schedule value that looks like a number (`"0"`, `"1"`; production has these) must come back as the string `"0"` from Redis, or every plan lookup silently fails → Task 1 (`storage.redis.test.ts`, "a value of \"0\" round-trips as the string \"0\"").
2. A note whose text parses as JSON (`5`, `true`, `[1]`) must round-trip unchanged → Task 3 ("a note that looks like JSON is stored and read as text").
3. `createPlan` when the counter yields an id that already exists (hand-added plan, fresh deploy) must not overwrite that plan → Task 7 ("skips an id that already exists").
4. The migration must give the one production tap key without a rep suffix its `-0`, and must keep the first of two entries sharing an id → Task 9 (`storage-migration.test.mjs`).
5. The practice-log dev file must drop a day whose set becomes empty rather than leaving `[]` behind, matching today's notes behaviour → Task 1 ("removes an emptied slot from the file").

---

### Task 1: Storage helpers and a fake Redis for tests

**Files:**
- Modify: `src/app/storage.ts`
- Create: `src/app/test-support/fake-redis.ts`
- Test: `src/app/storage.test.ts` (file path), `src/app/storage.redis.test.ts` (Redis path)

**Interfaces:**
- Consumes: existing `redis`, `dataPath`, `readJson`, `writeJson` (unchanged).
- Produces (all exported from `src/app/storage.ts`):
  ```ts
  export type FileRef = { path: string; slot?: string };
  export type Codec<T> = { encode(value: T): string; decode(raw: string): T };
  export const stringCodec: Codec<string>;
  export function jsonCodec<T>(): Codec<T>;
  export const redisRaw: Redis | null;  // same env check as `redis`, automaticDeserialization: false
  export async function hashGetAll<T>(redisKey: string, file: FileRef, codec: Codec<T>): Promise<Record<string, T>>;
  export async function hashGet<T>(redisKey: string, file: FileRef, codec: Codec<T>, field: string): Promise<T | null>;
  export async function hashSet<T>(redisKey: string, file: FileRef, codec: Codec<T>, field: string, value: T): Promise<void>;
  export async function hashSetIfAbsent<T>(redisKey: string, file: FileRef, codec: Codec<T>, field: string, value: T): Promise<boolean>;
  export async function hashDelete(redisKey: string, file: FileRef, field: string): Promise<void>;
  export async function hashSeedIfEmpty<T>(redisKey: string, file: FileRef, codec: Codec<T>, seed: Record<string, T>): Promise<Record<string, T>>;
  export async function setMembers(redisKey: string, file: FileRef): Promise<string[]>;
  export async function setAdd(redisKey: string, file: FileRef, member: string): Promise<boolean>;
  export async function setRemove(redisKey: string, file: FileRef, member: string): Promise<void>;
  export async function nextId(redisKey: string, fallback: () => Promise<number>): Promise<number>;
  ```
  Test double, `src/app/test-support/fake-redis.ts`: `export class FakeRedis` with a module-level shared `Map<string, unknown>` store, `static reset()`, and methods `get`, `set`, `hgetall` (null when empty), `hget`, `hset(key, fields: Record<string,string>)`, `hsetnx(key, field, value) → 0|1`, `hdel(key, ...fields)`, `smembers`, `sadd(key, ...members) → number added`, `srem(key, ...members)`, `incr(key)`. Hash and set commands store and return strings. Tests install it with `vi.mock("@upstash/redis", async () => ({ Redis: (await import("./test-support/fake-redis")).FakeRedis }))` and set `process.env.KV_REST_API_URL = "fake"` before `vi.resetModules()` + dynamic import.

- [ ] **Step 1: Write the failing file-path tests** in `src/app/storage.test.ts`. Each test makes a temp file, sets `const file: FileRef = { path }` (or with `slot`), imports `./storage` fresh. Tests:
  - `hashGetAll` "returns {} when the file holds {}"
  - `hashSet` then `hashGetAll` "stores a string value under its field" (`{ a: "x" }`)
  - `hashSet` with `jsonCodec` "stores an object value as an object in the file" (file text parses to `{ a: { id: "a" } }`, not a string)
  - `hashSetIfAbsent` "returns false and keeps the old value when the field exists"
  - `hashDelete` "removes only that field"
  - `hashSeedIfEmpty` "returns the file contents and ignores the seed in dev"
  - slot: `hashSet` with `{ path, slot: "2026-01-01" }` "writes under the slot and leaves other slots alone"
  - `setAdd` "returns true for a new member and false for a repeat"; `setMembers` lists both members once
  - `setRemove` with slot "removes an emptied slot from the file" (file becomes `{}` after removing the last member)
  - `nextId` "uses the fallback in dev" (`fallback` resolves 7 → returns 7)
- [ ] **Step 2: Run** `npx vitest run src/app/storage.test.ts` — Expected: FAIL, exports not found.
- [ ] **Step 3: Write the failing Redis-path tests** in `src/app/storage.redis.test.ts` using `FakeRedis` (create the fake first; it has no logic worth testing on its own). Tests:
  - "returns {} for a hash Redis reports as null"
  - "a value of \"0\" round-trips as the string \"0\"" (`hashSet(stringCodec, "2020-01-06", "0")` → `hashGet` is `"0"`, `typeof` is `"string"`)
  - "an object value round-trips through jsonCodec" and the fake store holds a string for that field
  - "hashSetIfAbsent returns false when the field exists"
  - "hashSeedIfEmpty writes the seed only when the hash is empty" (second call with a different seed returns the first)
  - "setAdd returns true then false for the same member; setRemove drops it"
  - "nextId increments the counter and never calls the fallback"
- [ ] **Step 4: Run** `npx vitest run src/app/storage.redis.test.ts` — Expected: FAIL.
- [ ] **Step 5: Implement** the exports above in `storage.ts`. Dev file helpers: read the file (missing slot → `{}` or `[]`), mutate, write with `JSON.stringify(value, null, 2) + "\n"`, deleting a slot whose hash/set is empty. Redis: `redisRaw.hgetall/hget/hset/hsetnx/hdel/smembers/sadd/srem/incr`; `hashSeedIfEmpty` does one `hset` with all encoded seed fields when `hgetall` is null.
- [ ] **Step 6: Run** `npx vitest run src/app/storage` and `npm run typecheck` — Expected: both test files PASS, no type errors.
- [ ] **Step 7: Commit**
  ```bash
  git add src/app/storage.ts src/app/storage.test.ts src/app/storage.redis.test.ts src/app/test-support/fake-redis.ts
  git commit -m "feat: add hash and set storage helpers beside readJson/writeJson, with a fake Redis for the Redis path"
  ```

### Task 2: Practice log as a set per day

**Files:**
- Create: `src/app/practice-log.ts`
- Modify: `src/app/actions.ts` (`getDoneTasks`, `getDoneHistory`, `toggleTask`; delete `LOG_PATH`, `readLog`, `writeLog`, `migrateKeys`, `INDEXED_KEY_RE`, `redisKey`), `src/app/actions.test.ts:887-900` (delete the "lazy log-key migration" describe), `data/practice-log.json`
- Test: `src/app/practice-log.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces, in `practice-log.ts`:
  ```ts
  export function doneKey(logId: string): string;                       // `done:${logId}`
  export async function getDone(logId: string): Promise<string[]>;
  export async function toggleDone(logId: string, tapKey: string): Promise<string[]>;
  ```
  File ref: `{ path: dataPath("PRACTICE_LOG_PATH", "practice-log.json"), slot: logId }`.

- [ ] **Step 1: Write failing tests** in `practice-log.test.ts` (temp file via `PRACTICE_LOG_PATH`, `vi.resetModules`):
  - "getDone returns [] for a day with no entry"
  - "toggleDone adds a key then removes it on the second call" and returns the full list each time
  - "toggleDone on two different keys keeps both" (`["a-sing-0", "a-play-0"]` in any order)
  - "a linked account's logId is a separate day" (`"2026-01-01:mama"` vs `"2026-01-01"`)
- [ ] **Step 2: Run** `npx vitest run src/app/practice-log.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `practice-log.ts`. `toggleDone`: `setAdd`; if false → `setRemove`; return `setMembers`.
- [ ] **Step 4: Run** the test file — Expected: PASS.
- [ ] **Step 5: Rewire `actions.ts`.** `getDoneTasks(date, student)` → `getDone(doneLogId(student, date))`. `toggleTask` → `toggleDone(...)`. `getDoneHistory` → `Promise.all` over the dates in both modes (drop the sequential dev branch and its comment). Remove the deleted helpers and the `fs`/`path` imports if nothing else uses them (notes still does until Task 3; check). Delete the `describe("getDoneTasks — lazy log-key migration")` block in `actions.test.ts`.
- [ ] **Step 6: Normalise the committed dev file.** In `data/practice-log.json` change `"a-major-scale-playWithoutTrack"` to `"a-major-scale-playWithoutTrack-0"`.
- [ ] **Step 7: Run** `npm test` and `npm run typecheck` — Expected: all pass (one test deleted, four added on top of Task 1's).
- [ ] **Step 8: Commit**
  ```bash
  git add src/app/practice-log.ts src/app/practice-log.test.ts src/app/actions.ts src/app/actions.test.ts data/practice-log.json
  git commit -m "feat: keep the practice log as a Redis set per day and drop the read-time -0 fix-up actions.ts no longer needs"
  ```

### Task 3: Track notes as a hash per date

**Files:**
- Create: `src/app/notes.ts`
- Modify: `src/app/actions.ts` (`getNotesForDate`, `saveTrackNote`, `getNotesInRange`; delete `NOTES_PATH`, `readNotes`, `writeNotes`, `notesRedisKey`; keep `notesAddDays`)
- Test: `src/app/notes.test.ts`

**Interfaces:**
- Produces, in `notes.ts`:
  ```ts
  export async function getNotes(date: string): Promise<Record<string, string>>;
  export async function setNote(date: string, trackId: string, note: string): Promise<void>; // trims; "" deletes
  ```
  Key `note:${date}`; file `{ path: dataPath("NOTES_LOG_PATH", "notes-log.json"), slot: date }`; `stringCodec`.

- [ ] **Step 1: Write failing tests** in `notes.test.ts`:
  - "setNote stores trimmed text and getNotes returns it"
  - "an empty note deletes the field and an empty day leaves the file"
  - "a note that looks like JSON is stored and read as text" (`setNote(d, "t", "5")` → `getNotes(d).t === "5"`, and file content is `{ [d]: { t: "5" } }`)
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `notes.ts`; rewire the three actions to it.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `git add src/app/notes.ts src/app/notes.test.ts src/app/actions.ts` with message "feat: store track notes as a hash per date so actions.ts stops rewriting a whole day".

### Task 4: Blob URL map as a hash

**Files:**
- Modify: `src/app/track-blobs.ts`, `src/app/track-blobs.test.ts`, `src/app/actions.ts` (`getTrackBlobUrl` delegates)

**Interfaces:**
- Produces: `getTrackBlobs(): Promise<Record<string,string>>`, `getTrackBlobUrl(id): Promise<string | null>`, `setTrackBlobUrl(id, url): Promise<void>` in `track-blobs.ts`. Key `track:blob`, file `{ path: dataPath("TRACK_BLOBS_JSON_PATH", "track-blobs.json") }`, `stringCodec`.

- [ ] **Step 1: Update tests.** Keep "returns an empty map when the file holds {}" and "keeps entries written by someone else" (still valid: hashSet re-reads the file). Add "getTrackBlobUrl returns null for an unknown id and the URL for a known one".
- [ ] **Step 2: Run** `npx vitest run src/app/track-blobs.test.ts` — Expected: the new test FAILS (export missing).
- [ ] **Step 3: Implement**: `hashGetAll`, `hashGet`, `hashSet`; delete the re-read comment. `actions.ts` `getTrackBlobUrl` becomes a one-line delegate (the `/api/v/[id]` route and its mock import it from `actions`).
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** with message "feat: write one blob URL at a time with HSET instead of rewriting tracks:blobs".

### Task 5: Track catalog as a hash keyed by id

**Files:**
- Create: `src/app/tracks.ts`
- Modify: `src/app/actions.ts` (`getTracks`, `addTrack`, `savePlan`'s `newReferenceTracks` block; delete `TRACKS_KEY`, `TRACKS_PATH`, `tracksSeed` import), `data/tracks.json`, `src/app/seed-data.test.ts:11,41`, `scripts/rewrite-tracks-seed.mjs`, `src/app/plans/TrackPicker.tsx:39`, `src/app/actions.test.ts` (`setupTracksData` helper and the assertion at line 659)
- Test: `src/app/tracks.test.ts`, `src/app/plans/TrackPicker.test.tsx` (new)

**Interfaces:**
- Produces, in `tracks.ts`:
  ```ts
  export async function getTracks(): Promise<Track[]>;        // Object.values of hashSeedIfEmpty(..., tracksSeed)
  export async function addTracks(tracks: Track[]): Promise<Track[]>; // hashSetIfAbsent each; returns the ones written
  ```
  Key `track:all`, file `{ path: dataPath("TRACKS_JSON_PATH", "tracks.json") }`, `jsonCodec<Track>()`.

- [ ] **Step 1: Convert the seed.** `node -e 'const fs=require("fs");const a=JSON.parse(fs.readFileSync("data/tracks.json","utf-8"));fs.writeFileSync("data/tracks.json",JSON.stringify(Object.fromEntries(a.map(t=>[t.id,t])),null,2)+"\n")'`. Update `seed-data.test.ts` to iterate `Object.values(tracks)` (lines 11 and 41) and `rewrite-tracks-seed.mjs` to iterate `Object.values(tracks)` and write the object back.
- [ ] **Step 2: Write failing tests** in `tracks.test.ts` (temp file, id-keyed object):
  - "getTracks returns the file's tracks as an array"
  - "addTracks skips ids that already exist and returns only the new ones"
- [ ] **Step 3: Run** — Expected: FAIL.
- [ ] **Step 4: Implement** `tracks.ts`. In `actions.ts`: `getTracks` delegates; `addTrack(track, blobUrl)` → `addTracks([track])` then `setTrackBlobUrl`; `savePlan` → `addTracks(newReferenceTracks)` (drop the manual `existing` set).
- [ ] **Step 5: Update `actions.test.ts`.** `setupTracksData(data)` converts an array argument to an id-keyed object before writing (so its 28 call sites stay). Line 659: assert `Object.keys(JSON.parse(...))` equals `["scale"]`.
- [ ] **Step 6: TrackPicker.** Write `TrackPicker.test.tsx`: "lists tracks sorted by name regardless of input order" (render with `[{ name: "Zebra" }, { name: "apple" }]`, expect `apple` before `Zebra` in `getAllByRole("button")` text). Run → FAIL. Change line 39 to filter then `.sort((a, b) => a.name.localeCompare(b.name))`. Run → PASS.
- [ ] **Step 7: Run** `npm test`, `npm run typecheck` — Expected: PASS.
- [ ] **Step 8: Commit** with message "feat: key the track catalog by id in Redis and the dev seed; TrackPicker sorts by name since hash order is not stable".

### Task 6: Schedule as a hash keyed by date

**Files:**
- Create: `src/app/schedule.ts`
- Modify: `src/app/actions.ts` (`getSchedule`, `setDayType`, the schedule write in `createPlan`; delete `SCHEDULE_KEY`, `SCHEDULE_PATH`, `scheduleData` import)
- Test: `src/app/schedule.test.ts`

**Interfaces:**
- Produces, in `schedule.ts`:
  ```ts
  export async function getScheduleMap(): Promise<PlanSchedule>;                 // hashSeedIfEmpty(..., scheduleData)
  export async function setScheduleEntry(date: string, value: string): Promise<void>;
  export async function setScheduleEntryIfAbsent(date: string, value: string): Promise<boolean>;
  export async function deleteScheduleEntry(date: string): Promise<void>;
  export async function writeScheduleDiff(before: PlanSchedule, after: PlanSchedule): Promise<void>; // hashSet each changed/added date
  ```
  Key `schedule:day`, file `{ path: dataPath("SCHEDULE_JSON_PATH", "plan-schedule.json") }`, `stringCodec`.

- [ ] **Step 1: Write failing tests** in `schedule.test.ts`:
  - "setScheduleEntryIfAbsent writes once and reports false the second time"
  - "writeScheduleDiff writes only the dates whose value changed" (before `{a:"0", b:"1"}`, after `{a:"0", b:"2", c:"2"}` → file has `b: "2"`, `c: "2"`, `a` untouched)
  - "deleteScheduleEntry removes the date"
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `schedule.ts`. In `actions.ts`: `getSchedule` → `getScheduleMap`, then `ensureTodayInSchedule`; when `mutated`, `setScheduleEntryIfAbsent(today, schedule[today])`; if that returns false, return `getScheduleMap()` again. `setDayType` → `deleteScheduleEntry` or `setScheduleEntry`. `createPlan` → `writeScheduleDiff(schedule, applyActiveFrom(schedule, newId, anchor))`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` — Expected: PASS (the existing "fills today's entry" test at `actions.test.ts:370` still reads `persisted["2026-05-23"] === "3"`).
- [ ] **Step 5: Commit** with message "feat: store the schedule as a hash by date so autofill and day labels write one entry".

### Task 7: Plans as a hash keyed by id, with a counter

**Files:**
- Create: `src/app/plan-store.ts`
- Modify: `src/app/actions.ts` (`getPlans`, `savePlan`, `createPlan`; delete `PLANS_KEY`, `PLANS_PATH`, `plansSeed` import, `nextPlanId`), `data/plans.json`, `src/app/seed-data.test.ts:12,17`, `src/app/actions.test.ts` (`setupPlansData` converts arrays)
- Test: `src/app/plan-store.test.ts`

**Interfaces:**
- Produces, in `plan-store.ts`:
  ```ts
  export async function getPlanMap(): Promise<Record<string, Plan>>;   // hashSeedIfEmpty(..., plansSeed); caller normalises
  export async function putPlan(plan: Plan): Promise<void>;
  export async function createPlanWithNewId(plan: Omit<Plan, "id">): Promise<Plan>; // nextId + hashSetIfAbsent loop
  ```
  Keys `plan:all` (`jsonCodec<Plan>()`) and `plan:next-id`; file `{ path: dataPath("PLANS_JSON_PATH", "plans.json") }`. Dev fallback for `nextId`: max numeric id in the file + 1 (−1 → 0 when none).

- [ ] **Step 1: Convert the seed** with the same one-liner as Task 5 on `data/plans.json`. Update `seed-data.test.ts` to `Object.values(plans)`.
- [ ] **Step 2: Write failing tests** in `plan-store.test.ts`:
  - file path: "createPlanWithNewId uses max numeric id + 1 in dev" (ids `"0"`, `"2"` → `"3"`)
  - file path: "putPlan replaces a plan in place and leaves the others"
  - Redis path with `FakeRedis`: "skips an id that already exists" (hash holds plan `"1"`, counter at `0` → first `INCR` gives 1, exists → next gives 2; result id `"2"`, plan `"1"` unchanged)
- [ ] **Step 3: Run** — Expected: FAIL.
- [ ] **Step 4: Implement** `plan-store.ts`. In `actions.ts`: `getPlans` → `normalizePlans(Object.values(await getPlanMap()))`; `savePlan` → `putPlan`; `createPlan` → `createPlanWithNewId({ ...plan, createdDate })` then the Task 6 schedule diff; returns `{ id }`.
- [ ] **Step 5: `setupPlansData`** converts an array argument to an id-keyed object.
- [ ] **Step 6: Run** `npm test`, `npm run typecheck` — Expected: PASS.
- [ ] **Step 7: Commit** with message "feat: key plans by id and take new ids from a Redis counter that skips ids already present".

### Task 8: Node scripts write the new keys

**Files:**
- Modify: `scripts/add-recordings.mjs:21-60`, `scripts/reencode-videos.mjs:56-58,104-105`, `scripts/migrate-media.mjs:27-29,61-62`

- [ ] **Step 1: Switch each script** to `new Redis({ url, token, automaticDeserialization: false })`; read with `const raw = (await redis.hgetall("track:all")) ?? {}; const tracks = Object.values(raw).map((s) => JSON.parse(s));` and `const blobs = (await redis.hgetall("track:blob")) ?? {};`; write per entry: `redis.hset("track:all", { [t.id]: JSON.stringify(t) })` and `redis.hset("track:blob", { [id]: url })`. Update the log lines to name the new keys. `migrate-media.mjs` writes only the tracks it changed.
- [ ] **Step 2: Verify** `node --env-file=.env.local scripts/add-recordings.mjs` (dry run, no `--execute`) — Expected: lists the recordings and ends with "DRY-RUN complete" without throwing. (The `track:all` hash is empty until the migration runs, so every file shows as "add"; that is fine for a dry run.) `npm test` — Expected: PASS (`video-recipe.test.mjs` unaffected).
- [ ] **Step 3: Commit** with message "chore: point the recording scripts at track:all and track:blob, one HSET per entry".

### Task 9: Migration script

**Files:**
- Create: `scripts/storage-migration.mjs` (pure transforms), `scripts/migrate-storage.mjs` (I/O)
- Test: `scripts/storage-migration.test.mjs`

**Interfaces:**
- Produces, in `storage-migration.mjs`:
  ```js
  export function normalizeTapKeys(members)   // → { members: string[] (unique, each ending in -<digits>), normalized: string[] (the ones that gained "-0") }
  export function entriesById(array)          // → { entries: Record<id, object>, duplicates: string[] } first wins
  export function maxNumericId(ids)           // → number, -1 when none numeric
  export const KEY_MAP = { "tracks:list": "track:all", "tracks:blobs": "track:blob", "plans:list": "plan:all", "schedule:map": "schedule:day" };
  export function newPracticeKey(oldKey)      // "practice:X" → "done:X"
  export function newNotesKey(oldKey)         // "notes:X"   → "note:X"
  ```

- [ ] **Step 1: Write failing tests** in `storage-migration.test.mjs`:
  - "appends -0 to a member without a rep suffix and reports it" (`["a-sing", "a-sing-0", "b-play-1"]` → members `["a-sing-0", "b-play-1"]`, normalized `["a-sing"]`)
  - "keeps the first of two entries with the same id and lists the duplicate"
  - "maxNumericId ignores non-numeric ids and is -1 when none"
  - "maps every old key name to its new one"
- [ ] **Step 2: Run** `npx vitest run scripts/storage-migration.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** `storage-migration.mjs`, then `migrate-storage.mjs`: dry run by default, `--execute` to write, raw client. Per collection: `GET` old → transform → dry run prints `new key | type | would write N | already present M | normalized/duplicates`; execute does `hsetnx` per field (strings raw, Track/Plan via `JSON.stringify`) or `sadd` per member, sets `plan:next-id` only if `maxNumericId > current`, then reads back and asserts `count >= unique old entries`. `KEYS practice:*` and `KEYS notes:*` for the per-day keys. Summary table at the end; non-zero exit on any failed read-back.
- [ ] **Step 4: Run** `npx vitest run scripts/storage-migration.test.mjs` — PASS. Then `node --env-file=.env.local scripts/migrate-storage.mjs` (dry run against prod) — Expected: tracks 66, plans 47, schedule 188, ~128 practice keys totalling 2472 members with 1 normalised, ~19 note keys, no duplicates, nothing written. Paste the summary into the PR description later.
- [ ] **Step 5: Commit** with message "feat: add the one-step storage migration (dry run by default, HSETNX/SADD so it can be re-run after deploy)".

### Task 10: Docs, and re-enable Vercel builds

**Files:**
- Modify: `README.md` (lines 76, 174, 207, 231 key names; new "Storage layout" paragraph under the deployment section listing the keys table from the spec, the plain-text vs JSON note for console edits, and that hand-added plans are safe), delete `vercel.json`
- Modify: `docs/superpowers/plans/2026-11-14-auto-reencode-uploads.md` header Status line: add "Storage helpers landed in #44; re-check Task 3 against `hashGetAll/hashSet/hashDelete(redisKey, file, codec, …)` before resuming."

- [ ] **Step 1: README edits** as listed. Add a "Migrating an existing deployment" subsection with the session steps from the spec (dry run, `--execute`, merge, `--execute` again, smoke test, delete old keys a week later).
- [ ] **Step 2: Commit docs** with message "docs: describe the per-record storage layout and the migration session".
- [ ] **Step 3: Final commit:** `git rm vercel.json`, message "chore: re-enable Vercel builds now that the branch is ready to merge". Do this only when the PR is otherwise ready; it is the last commit on the branch.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint` — Expected: all clean.
