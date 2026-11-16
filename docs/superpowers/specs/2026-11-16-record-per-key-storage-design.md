# Store each record on its own — design

Issue: #44. Branch: `44-store-each-record-on-its-own`.

## Intent

Every write in the app should touch only its own record, so two writers that
overlap can never erase each other's change. Today each collection in Redis is
one JSON value, and every update is read the whole value, change it in memory,
write the whole value back (`readJson`/`writeJson` in `src/app/storage.ts`).
The second of two overlapping writes carries a copy that never saw the first.
The practice log is the most exposed: every `TaskList` on the Practice page
writes the same `practice:<day>` key, and two taps on different tasks inside
one server round trip can drop one. The parked #31 mark store would have added
another whole-map writer, which is what surfaced this.

## Goals

- A single update changes exactly one field of one hash, or one member of one
  set. No code path reads a whole collection in order to write it back.
- Dev mode keeps working with no Redis, from JSON files under `data/`.
- Everything stays readable and hand-editable in the Upstash console.
- One PR, one migration session, reviewed commit by commit.
- Old data stays in place as the rollback until the new version is trusted.

## Non-goals

- Changing any screen, action signature, or client component. `TaskList`,
  the Plans editor, the Teacher report, and the API routes keep their
  behaviour. The one exception is noted under Tracks (picker order).
- Making the dev file fallback concurrency-safe. Dev has one writer.
- Touching `students:list`, `teacher:info`, `checklist:blobs`. They are
  effectively read-only and keep the old shape and helpers.
- Implementing the #31 mark store. It is designed here only as far as naming,
  so it lands on the new shape later.

## Anti-goals

- A generic storage abstraction. Six collections do not justify one.
- A dual-read period where old and new code must both run. The app can pause,
  so the migration is one step.
- Lua scripts or compare-and-set over the existing JSON blobs. Rejected in
  the issue; they keep the shape that causes the problem.

## Constraints

- Upstash Redis via `@upstash/redis` (REST, auto-serialises values). Redis
  rejects a command of the wrong type on an existing key (`WRONGTYPE`), so a
  new shape needs a new key name.
- Vercel's filesystem is read-only at runtime; all production writes go to
  Redis.
- `actions.ts` is a `"use server"` file: every export is a callable endpoint,
  so storage helpers live outside it (as #43 established with `storage.ts` and
  `track-blobs.ts`).
- Existing tests point the file fallback at temp files through env vars
  (`PRACTICE_LOG_PATH`, `NOTES_LOG_PATH`, `PLANS_JSON_PATH`,
  `SCHEDULE_JSON_PATH`, `TRACKS_JSON_PATH`, `TRACK_BLOBS_JSON_PATH`) and
  `vi.resetModules()`. Those env var names stay.
- Preview deployments of this branch are disabled by the branch's
  `vercel.json` (`git.deploymentEnabled`), and the Upstash connection is
  scoped to Production only in Vercel. Both were put in place on 2026-11-16.

## Approaches considered

**A. Structure-shaped helpers, one module per collection (chosen).**
`storage.ts` gains helpers that mirror the Redis commands (hash get-all, set,
set-if-absent, delete; set members, add, remove), each with a JSON-file
fallback. Each collection gets a small module beside `track-blobs.ts`.
`actions.ts` keeps its exported actions; each body becomes a call or two into
a module. Matches the code reviewed in #43; nothing abstract to learn; each
review commit has one module to look at.

**B. One generic `Collection<T>` interface** with get, put, remove, all and
two implementations (Redis hash, JSON file). Tidier typing, but sets become a
collection of booleans, the schedule's atomic set-if-absent needs an extra
method anyway, and the abstraction costs more than six collections save.

**Dropped.** Lua / compare-and-set on the current blobs (see anti-goals).

Siyuan picked A on 2026-11-16 and asked for one PR with one migration session.

## Design

### Keys

| Collection | Old key (JSON value) | New key | Redis type | Field → value |
|---|---|---|---|---|
| Practice log | `practice:<logId>` array of tap keys | `done:<logId>` | set | member = tap key `trackId-type[:focus]-repIndex` |
| Track notes | `notes:<date>` map | `note:<date>` | hash | trackId → note text |
| Blob URLs | `tracks:blobs` map | `track:blob` | hash | trackId → URL |
| Track catalog | `tracks:list` array | `track:all` | hash | trackId → Track (JSON) |
| Plans | `plans:list` array | `plan:all` | hash | planId → Plan (JSON) |
| Plan id counter | (max numeric id + 1) | `plan:next-id` | string (integer) | `INCR` on create |
| Schedule | `schedule:map` map | `schedule:day` | hash | date → planId or day-type id |
| Re-encode marks (#31, later) | — | `track:reencode` | hash | trackId → mark |
| Unchanged | `students:list`, `teacher:info`, `checklist:blobs` | same | JSON value | — |

`<logId>` is `doneLogId(student, date)`: the date for the primary student,
`date:studentId` for a linked account. Unchanged.

Old keys are not read, written, or deleted by the new code. They stay as the
rollback and are deleted by hand a week after the migration.

### Storage helpers (`src/app/storage.ts`)

Keep `redis`, `dataPath`, `readJson`, `writeJson` for the unchanged keys. Add:

```ts
// Where a collection lives in dev. `slot` selects one top-level property of
// the file, for the two collections whose Redis keys are per day but whose dev
// data stays in one file (practice-log.json, notes-log.json).
export type FileRef = { path: string; slot?: string };

// How a field value is written to and read from Redis. See "Value encoding".
export type Codec<T> = { encode(value: T): string; decode(raw: string): T };
export const stringCodec: Codec<string>;          // identity
export function jsonCodec<T>(): Codec<T>;          // JSON.stringify / JSON.parse

export async function hashGetAll<T>(redisKey: string, file: FileRef, codec: Codec<T>): Promise<Record<string, T>>;
export async function hashGet<T>(redisKey: string, file: FileRef, codec: Codec<T>, field: string): Promise<T | null>;
export async function hashSet<T>(redisKey: string, file: FileRef, codec: Codec<T>, field: string, value: T): Promise<void>;
export async function hashSetIfAbsent<T>(redisKey: string, file: FileRef, codec: Codec<T>, field: string, value: T): Promise<boolean>; // HSETNX; true when written
export async function hashDelete(redisKey: string, file: FileRef, field: string): Promise<void>;
export async function hashSeedIfEmpty<T>(redisKey: string, file: FileRef, codec: Codec<T>, seed: Record<string, T>): Promise<Record<string, T>>; // see Seeding

export async function setMembers(redisKey: string, file: FileRef): Promise<string[]>;
export async function setAdd(redisKey: string, file: FileRef, member: string): Promise<boolean>;    // SADD; true when newly added
export async function setRemove(redisKey: string, file: FileRef, member: string): Promise<void>;

export async function nextId(redisKey: string, fallback: () => Promise<number>): Promise<number>; // INCR in Redis; fallback() in dev
```

Dev fallback shapes: a hash is a JSON object, a set is a JSON array of
strings. With a `slot`, the file holds an object whose property `slot` is that
object or array; a slot whose hash or set becomes empty is removed from the
file (keeps today's behaviour for `notes-log.json`). Dev writes stay
read-modify-write of the file; dev has one writer. The dev file never uses
the codec: values are stored as JSON values in the file, strings as strings
and objects as objects.

`HGETALL` on a missing or empty hash returns `null` in `@upstash/redis`; the
helpers return `{}`.

Return types are plain arrays and records so they can cross the server/client
boundary.

### Value encoding

`@upstash/redis` runs `JSON.parse` on every value it reads, including hash
fields and set members, and falls back to the raw string when parsing fails.
A schedule value `"0"` (a plan id; production has these) would come back as
the number `0`, and `value === planId` comparisons would silently fail. A note
whose text is `5` or `true` would change type.

So the new helpers use a **second client created with
`automaticDeserialization: false`** (`redisRaw` in `storage.ts`) and encode
and decode explicitly through the codec:

- `stringCodec` for notes, blob URLs, schedule values, and all set members.
  The Upstash console shows the plain text (`0`, `individual-class`, the
  note), which is what a person hand-editing should type.
- `jsonCodec<Track>()` / `jsonCodec<Plan>()` for the catalog and plans. The
  console shows one JSON object per field, the same text a person edits in
  the array today.

`readJson`/`writeJson` keep the existing auto-deserialising `redis` client;
the three unchanged keys are whole JSON values and behave as before. The Node
scripts also create their clients with `automaticDeserialization: false` and
encode the same way, so a script and the app never disagree about a value.

### Seeding

Today `readJson` writes the committed seed to Redis when a key is empty, so a
fresh deployment works out of the box (README promises this). Keep that for
the three collections that have a seed: tracks, plans, schedule.
`hashSeedIfEmpty` does `HGETALL`; if the result is empty, `HSET` every seed
field and return the seed. Practice log, notes, blob map have no seed and
start empty.

Because of this, `data/tracks.json`, `data/plans.json` and
`data/plan-schedule.json` are also the dev stores, and dev files mirror the
Redis shape. **`data/tracks.json` and `data/plans.json` change from arrays to
objects keyed by id** (my call: one helper set, and dev and prod data look the
same, which is the point of this change). `data/plan-schedule.json` is already
an object keyed by date. `data/practice-log.json` is already an object keyed
by logId with array values; its one committed entry gains the `-0` rep suffix
so the legacy fix-up can be dropped (see Practice log).

### Collection modules (`src/app/`)

One file each, in the style of `track-blobs.ts`: the key name, the `FileRef`
builder reading the env var, and the functions `actions.ts` needs. None of
these files is `"use server"`.

**`practice-log.ts`**

- `getDoneTasks(logId): Promise<string[]>` → `setMembers`.
- `toggleDone(logId, tapKey): Promise<string[]>` → `setAdd`; when it returns
  false the member existed, so `setRemove`; then `setMembers` and return it.
  `toggleTask` in `actions.ts` keeps returning the full list, so `TaskList`
  is untouched.
- The `migrateKeys` fix-up that appends `-0` to index-less legacy keys at read
  time is removed. The migration script normalises prod data; the committed
  dev file is normalised in this PR.
- `getDoneHistory` and `getMonthProgress` keep reading one day at a time. In
  Redis they may run days in parallel (`Promise.all`), as today. The dev path
  can also run in parallel now that reads no longer rewrite the file.

**`notes.ts`**

- `getNotesForDate(date): Promise<Record<string,string>>` → `hashGetAll`.
- `setTrackNote(date, trackId, note)` → trimmed empty note is `hashDelete`,
  otherwise `hashSet`.
- `getNotesInRange` is unchanged logic over `getNotesForDate`.

**`track-blobs.ts`** (exists)

- `getTrackBlobs()` → `hashGetAll`; `getTrackBlobUrl(id)` → `hashGet`.
- `setTrackBlobUrl(id, url)` → `hashSet`. The re-read-then-write and its
  comment go away.

**`tracks.ts`**

- `getTracks(): Promise<Track[]>` → `Object.values(await hashSeedIfEmpty(...))`.
  Callers keep receiving an array. Hash order is not stable, so the one
  consumer that showed list order, `TrackPicker`, sorts by name on read
  (checked in the issue on 2026-11-15: no other consumer depends on order).
- `addTracks(tracks: Track[])` → `hashSetIfAbsent` per track (skips ids that
  exist, which is today's "idempotent against double-saves" behaviour in
  `savePlan`). `addTrack` in the upload route and `savePlan`'s
  `newReferenceTracks` both use it.

**`plans.ts`** (module name is taken by `src/app/plans.ts` types; use
`plan-store.ts`)

- `getPlans(): Promise<Plan[]>` → `Object.values(hashSeedIfEmpty(...))` then
  the existing `normalizePlans` (legacy item shapes, unchanged).
- `putPlan(plan)` → `hashSet`. `savePlan` keeps its frozen check first.
- `createPlan` allocates the id and writes the plan in one loop:
  `nextId("plan:next-id", fallback)` then `hashSetIfAbsent` with that id;
  when the id already exists (a plan added by hand in the console, or a
  fresh deployment whose counter starts below the seed) it takes the next
  `INCR` and tries again. The dev fallback for `nextId` is today's max numeric
  id + 1 over the file. The migration script seeds `plan:next-id` to the
  current maximum numeric id, so the first `INCR` yields max + 1. The README
  notes that plans added by hand are safe: the counter skips over them.

**`schedule.ts`**

- `getSchedule()` → `hashSeedIfEmpty`, then the autofill of today's entry
  becomes `hashSetIfAbsent(key, file, today, lastPlanId)` instead of a whole
  write. `ensureTodayInSchedule` stays as the pure function that computes the
  value; only the write changes.
- `setDayType(date, id | null)` → `hashDelete` or `hashSet`.
- `createPlan`'s `applyActiveFrom(schedule, newId, anchor)` returns a whole
  new schedule today. Change to write only the entries that differ from the
  current schedule, each with `hashSet`/`hashDelete`. The pure function and
  its tests are unchanged; the write loop diffs its result against the input.

### `actions.ts`

Keeps every exported action with the same signature and return type. Bodies
delegate to the modules. The file-path constants, `readLog`/`writeLog`,
`readNotes`/`writeNotes`, `migrateKeys`, `nextPlanId`, and the direct `redis`
calls for the practice log and notes leave this file. `readJson`/`writeJson`
remain only for students, teacher, checklist blobs.

### Node scripts

`scripts/add-recordings.mjs`, `scripts/reencode-videos.mjs`,
`scripts/migrate-media.mjs` read `tracks:list`/`tracks:blobs` with `GET` and
write them whole with `SET`. They switch to `HGETALL` on `track:all` /
`track:blob` and `HSET` per entry, with `automaticDeserialization: false` and
explicit `JSON.stringify`/`JSON.parse` for Track objects (see Value
encoding). They keep importing nothing from the app.
`scripts/rewrite-tracks-seed.mjs` and `src/app/seed-data.test.ts` read
`data/tracks.json` / `data/plans.json` as arrays and are updated for the
id-keyed shape. `scripts/migrate-checklist-images.mjs` is unchanged
(`checklist:blobs` stays).

### Migration script: `scripts/migrate-storage.mjs`

Follows the `migrate-checklist-images.mjs` convention: dry run by default,
`--execute` to write. Runs against whatever `KV_REST_API_*` the env gives it.

For each old key (practice and notes keys found with `KEYS` on their
prefixes; production has about 130 practice keys and 20 note keys):

1. `GET` the old value.
2. Compute the new entries. Practice arrays: append `-0` to any member without
   a numeric rep suffix (the old `migrateKeys` rule; production has one such
   member), then de-duplicate. Tracks and plans: key by `id`; when an id
   repeats, the **first** entry wins, matching today's `find`, and the dry run
   lists every duplicate (production has none today). Others: as is.
3. Dry run: print the new key, type, how many entries would be written and
   how many already exist, plus any member that was normalised. Execute:
   write **without overwriting**: `HSETNX` per field, `SADD` per member,
   and `plan:next-id` set to the maximum numeric plan id only if that is
   higher than the current counter (or `-1` when there are no plans and no
   counter). Then read back and assert the new key holds at least as many
   entries as the unique old ones.

Old keys are never written or deleted. The script never overwrites a new-shape
entry, so it can be run again after the deploy to pick up anything the old
code wrote between `--execute` and the new code going live, and again after a
rollback-and-retry. It prints a summary table and exits non-zero if any
read-back check fails.

### Migration session (one step, quiet moment)

1. Dry run against prod; read the output.
2. `--execute`; confirm the summary.
3. Remove `vercel.json` in the final commit, merge the PR, let Vercel deploy.
4. Run `--execute` once more. It reports zero new entries unless someone
   used the app between steps 2 and 3; either way, nothing is overwritten.
5. Smoke test: Practice page, tick and untick one task, open Plans, open the
   Teacher report.
6. Rollback if needed: revert the merge on GitHub. Old code reads old keys,
   which were never touched. Edits made on the new keys in the meantime are
   not copied back; the window is the smoke test only.
7. A week later, delete the old keys from the Upstash console (`DEL` on
   `tracks:list tracks:blobs plans:list schedule:map` and the `practice:*`,
   `notes:*` keys).

### Tests

- `storage.test.ts`: each new helper against a temp file, including `slot`
  behaviour and empty-slot removal.
- One test file per new module on temp files via the existing env vars.
- `actions.test.ts` stays as the black-box suite; its setup helpers that write
  `plans.json`/`tracks.json` write id-keyed objects. Tests that assert the
  dev file contents after `toggleTask` keep passing because the file shape
  for the practice log is unchanged.
- `scripts/migrate-storage.test.mjs`: the pure transform (old value → new
  entries) per collection, including the `-0` normalisation and
  de-duplication. The Redis I/O is verified by the dry run against prod.
- The Redis code path has no unit tests today and gets none here; the dry run,
  read-back assertion, and smoke test cover it.

### Documentation

README: key names in the Upstash-console instructions (plans checklist
editing, "make it yours", manual ffmpeg recipe, re-encode script), the note
that `data/tracks.json` and `data/plans.json` are keyed by id, and a short
"storage layout" paragraph listing the keys above. The #31 plan's Task 3 is
re-pointed at these helper signatures when #31 resumes (not in this PR).

## Left to the builder

- Internal names and file layout inside each module, as long as the exported
  functions above exist.
- Whether `hashGet` uses `HGET` or `HGETALL` and indexes (prefer `HGET`).
- Exact dry-run output format.
- Commit boundaries, as long as each commit leaves the suite green and
  touches one module or one script where possible. Suggested order: helpers,
  practice log, notes, blobs, tracks, plans, schedule, scripts, migration
  script, docs and dev-data conversion, remove `vercel.json` last.

## Calls I made (for Siyuan to check)

- `data/tracks.json` and `data/plans.json` become objects keyed by id.
- New key names as in the table; old names untouched.
- Plan ids come from a Redis counter in prod, max + 1 in dev, and
  `createPlan` skips ids that already exist (hand-added plans are safe).
- `TrackPicker` sorts by name because hash order is not stable.
- `toggleTask` keeps returning the full list; `TaskList` is untouched.
- The legacy `-0` fix-up is removed; the migration normalises instead.
- `scripts/migrate-media.mjs` is updated, not deleted.
- Values are stored as plain strings (notes, schedule, blob URLs, tap keys)
  or JSON objects (tracks, plans) through a non-deserialising client and
  explicit codecs, so `"0"` stays a string and the console shows plain text.
- The migration never overwrites a new-shape entry, so it can be re-run after
  the deploy. Duplicate ids (none in production today) keep the first entry.
