# Auto Re-encode Phone Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A video uploaded from the iPhone Shortcut is re-encoded on Vercel right after registration, and a plain ⚠️ shows next to the video's name until that has succeeded.

**Architecture:** `POST /api/tracks` writes a mark for the new track to a new Redis key, replies, then runs the re-encode in `after()`. The job and the existing `scripts/reencode-videos.mjs` share one recipe module (`scripts/video-recipe.mjs`) for the ffmpeg arguments, the conformance check, the faststart probe and the new-path rule. The JSON storage helpers move out of `actions.ts` into a plain module so the job can use them without becoming a server action. The Practice and Plans pages read the marks and pass the marked IDs down as a `string[]` prop.

**Tech Stack:** Next.js 16.2.7 (app router, `after()`, route `maxDuration`), `ffmpeg-static` 5.3.0, `@vercel/blob`, `@upstash/redis`, Vitest 4 + Testing Library.

**Spec:** [docs/superpowers/specs/2026-11-02-auto-reencode-uploads-design.md](../specs/2026-11-02-auto-reencode-uploads-design.md). Issue [#31](https://github.com/sjiang1/string-steps/issues/31), branch `31-auto-reencode-uploads`.

## Global Constraints

- ffmpeg settings are exactly those of `ffmpegArgs()` today: libx264, CRF 28, preset medium, `scale=-2:min(720\,ih)`, AAC 128k, `+faststart`. One definition, shared by script and route.
- A video conforms when it is faststart and its bitrate is at most `BITRATE_CEILING` = 2 500 000 bit/s. Unknown bitrate with faststart conforms.
- Re-encoded output goes to `videos/<id>.mp4` (or `videos/<id>-reencoded.mp4` if the source already lives there), uploaded with `access: "public"`, `contentType: "video/mp4"`, `addRandomSuffix: false`, `allowOverwrite: true`.
- The mark lives in Redis key `tracks:reencode`, a map of track ID to `{ since: <ISO time>, error?: <message> }`. In dev it is the file `data/track-reencode.json`, overridable with `TRACK_REENCODE_JSON_PATH`.
- `tracks:blobs` is re-read immediately before it is written. Never write a copy read before the encode.
- The ⚠️ is a bare `⚠️` character in a `<span>`. No visible words, no `title`, no click handler. An `aria-label` is allowed since it is not visible.
- Props crossing the server/client boundary must be serialisable: marked IDs travel as `string[]`, never `Set`.
- No job code in `src/app/actions.ts`. Every export of that `"use server"` file is a callable endpoint.
- The phone never waits for encoding. The route replies before the job starts.
- Run `npm test`, `npm run lint`, `npm run typecheck` before each commit. Commit messages describe how the files relate and end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **The `tracks:reencode` value is hand-edited into garbage** (null, a string, an array). Pages must still render and the job must still be able to write marks. → Task 3 test "treats a non-object value as no marks".
2. **The download or the Blob upload fails** (404, network). The original must stay in place, `tracks:blobs` untouched, the error saved on the mark, nothing thrown out of the job. → Task 5 tests "records the error when the download fails" and "leaves tracks:blobs alone when the upload fails".
3. **Deleting the original fails after the swap succeeded.** The new file is live, so the mark must still clear. → Task 5 test "clears the mark even when deleting the original fails".
4. **A mark exists for an ID no component can resolve** (track removed from Redis by hand). Components must render without complaint. → Task 8 test "ignores marked IDs that are not in the list".
5. **The script and the route run on the same video at once.** The later `tracks:blobs` write must not revive a URL the other one already replaced for a different track. → Task 1 test "keeps entries written by someone else".

---

### Task 1: Move the JSON storage helpers out of `actions.ts`

**Files:**
- Create: `src/app/storage.ts`
- Create: `src/app/track-blobs.ts`
- Create: `src/app/track-blobs.test.ts`
- Modify: `src/app/actions.ts:22-30` (redis client), `:95-112` (readJson/writeJson), `:418-439` (addTrack/getTrackBlobUrl)

**Interfaces:**
- Produces, `src/app/storage.ts`:
  - `readJson<T>(redisKey: string, filePath: string, seed: T): Promise<T>` and `writeJson<T>(redisKey: string, filePath: string, value: T): Promise<void>` — the bodies currently in `actions.ts`, unchanged.
  - `dataPath(envVar: string, fileName: string): string` returning `process.env[envVar] ?? join(process.cwd(), "data", fileName)`, evaluated at call time (tests set env vars after import).
- Produces, `src/app/track-blobs.ts`:
  - `getTrackBlobs(): Promise<Record<string, string>>`
  - `setTrackBlobUrl(id: string, url: string): Promise<void>` — reads the map, sets one key, writes it back.
  - Key `"tracks:blobs"`, path `dataPath("TRACK_BLOBS_JSON_PATH", "track-blobs.json")`.

- [ ] **Step 1: Write the failing test** in `src/app/track-blobs.test.ts`, following `actions.test.ts`: `vi.resetModules()` in `beforeEach`, a temp file assigned to `process.env.TRACK_BLOBS_JSON_PATH`, dynamic `import("./track-blobs")`.

```ts
it("keeps entries written by someone else", async () => {
  writeFileSync(file, JSON.stringify({ a: "https://blob/a.mp4" }));
  const { setTrackBlobUrl, getTrackBlobs } = await import("./track-blobs");
  await setTrackBlobUrl("b", "https://blob/b.mp4");
  // Someone else writes between our read and the next call
  writeFileSync(file, JSON.stringify({ a: "https://blob/a2.mp4", b: "https://blob/b.mp4" }));
  await setTrackBlobUrl("c", "https://blob/c.mp4");
  expect(await getTrackBlobs()).toEqual({
    a: "https://blob/a2.mp4", b: "https://blob/b.mp4", c: "https://blob/c.mp4",
  });
});
it("returns an empty map when the file holds {}", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/app/track-blobs.test.ts` → FAIL, module not found.

- [ ] **Step 3: Create `storage.ts`** by moving the `useRedis`/`redis` client and `readJson`/`writeJson` out of `actions.ts` verbatim, exporting them, and adding `dataPath`. Create `track-blobs.ts` on top of it.

- [ ] **Step 4: Rewire `actions.ts`**: import `readJson`, `writeJson` from `./storage`; delete its own copies and the redis client; `addTrack` calls `setTrackBlobUrl(track.id, blobUrl)`; `getTrackBlobUrl` becomes `(await getTrackBlobs())[id] ?? null`; delete `TRACK_BLOBS_KEY`/`TRACK_BLOBS_PATH`. Keep every other key and path constant where it is.

- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run lint` → all pass, including the existing `actions.test.ts`.

- [ ] **Step 6: Commit** — `refactor: move JSON storage helpers out of actions.ts so non-action code can use them`.

---

### Task 2: Shared video recipe module

**Files:**
- Create: `scripts/video-recipe.mjs`
- Create: `scripts/video-recipe.test.mjs` (move the existing tests here, add two)
- Modify: `scripts/reencode-videos.mjs` (import from the recipe instead of defining)
- Delete: `scripts/reencode-videos.test.mjs` (its tests move)

**Interfaces:**
- Produces, `scripts/video-recipe.mjs` (plain ESM, no TypeScript, importable from both Node scripts and `src/` thanks to `allowJs`):
  - `BITRATE_CEILING`, `needsReencode({ faststart, bitrate })`, `ffmpegArgs(inPath, outPath)`, `newPathnameFor(id, oldPathname)` — moved unchanged.
  - `atomsAreFaststart(buf: Buffer): boolean` — moved unchanged, now exported.
  - `parseInputBitrate(ffmpegStderr: string): number | null` — new. Finds the first `bitrate: <n> kb/s` in ffmpeg's `-i` banner and returns `n * 1000`; `null` when absent or `N/A`.

- [ ] **Step 1: Write the failing tests** in `scripts/video-recipe.test.mjs`: copy the five `needsReencode` and one `ffmpegArgs` tests from `reencode-videos.test.mjs`, re-pointing the import, and add:

```js
describe("parseInputBitrate", () => {
  it("reads the kb/s figure from ffmpeg's input banner", () => {
    const stderr = "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':\n  Duration: 00:00:58.03, start: 0.000000, bitrate: 5523 kb/s\n";
    expect(parseInputBitrate(stderr)).toBe(5_523_000);
  });
  it("returns null when ffmpeg prints N/A or nothing", () => {
    expect(parseInputBitrate("  Duration: N/A, bitrate: N/A\n")).toBeNull();
    expect(parseInputBitrate("")).toBeNull();
  });
});
describe("atomsAreFaststart", () => {
  // Build minimal boxes: 8-byte header = size(4) + type(4), no payload needed.
  const box = (type) => { const b = Buffer.alloc(8); b.writeUInt32BE(8, 0); b.write(type, 4, "latin1"); return b; };
  it("is true when moov precedes mdat", () =>
    expect(atomsAreFaststart(Buffer.concat([box("ftyp"), box("moov"), box("mdat")]))).toBe(true));
  it("is false when mdat precedes moov", () =>
    expect(atomsAreFaststart(Buffer.concat([box("ftyp"), box("mdat"), box("moov")]))).toBe(false));
});
```

- [ ] **Step 2: Run** `npx vitest run scripts/video-recipe.test.mjs` → FAIL, module not found.

- [ ] **Step 3: Create `video-recipe.mjs`** by cutting the four exports and `atomsAreFaststart` out of `reencode-videos.mjs`, then add `parseInputBitrate`. In `reencode-videos.mjs`, `import { BITRATE_CEILING, needsReencode, ffmpegArgs, newPathnameFor, atomsAreFaststart } from "./video-recipe.mjs";` and delete the old test file.

- [ ] **Step 4: Run** `npm test` → pass. Then run the script's audit against prod to prove the import wiring: `node --env-file=.env.local scripts/reencode-videos.mjs` → prints `videos=17` and `All videos conform`.

- [ ] **Step 5: Commit** — `refactor: split the video recipe out of reencode-videos.mjs so the upload route can share it`.

---

### Task 3: Re-encode marks store

**Files:**
- Create: `src/app/reencode-marks.ts`
- Create: `src/app/reencode-marks.test.ts`
- Create: `data/track-reencode.json` containing `{}`

**Interfaces:**
- Produces, `src/app/reencode-marks.ts`:
  - `type ReencodeMark = { since: string; error?: string }`
  - `getReencodeMarks(): Promise<Record<string, ReencodeMark>>` — returns `{}` if the stored value is not a plain object.
  - `markReencoding(id: string, now: Date = new Date()): Promise<void>` — sets `{ since: now.toISOString() }`, replacing any previous mark.
  - `recordReencodeError(id: string, message: string): Promise<void>` — keeps the existing `since` (or sets one now if none), sets `error`.
  - `clearReencodeMark(id: string): Promise<void>` — removes the key; no-op if absent.
  - Key `"tracks:reencode"`, path `dataPath("TRACK_REENCODE_JSON_PATH", "track-reencode.json")`, via Task 1's `readJson`/`writeJson`.

- [ ] **Step 1: Write the failing tests**, same temp-file pattern as Task 1 with `TRACK_REENCODE_JSON_PATH`:

```ts
it("marks with the given time and clears", ...)                // mark → {id:{since:"2026-11-14T10:00:00.000Z"}}; clear → {}
it("records an error without losing since", ...)              // mark at T; recordReencodeError(id,"boom") → {since:T, error:"boom"}
it("records an error for an unmarked id", ...)                // since is present, error "boom"
it("clearing an absent id leaves the others untouched", ...)
it("treats a non-object value as no marks", async () => {
  writeFileSync(file, JSON.stringify("oops"));
  expect(await getReencodeMarks()).toEqual({});
});
```

- [ ] **Step 2: Run** `npx vitest run src/app/reencode-marks.test.ts` → FAIL.

- [ ] **Step 3: Implement** the module and add `data/track-reencode.json` with `{}`.

- [ ] **Step 4: Run** `npm test && npm run typecheck` → pass.

- [ ] **Step 5: Commit** — `feat: add a tracks:reencode mark store, seeded with an empty dev file`.

---

### Task 4: ffmpeg tools for the server

**Files:**
- Create: `src/app/video-tools.ts`
- Create: `src/app/video-tools.test.ts`
- Modify: `next.config.ts`, `package.json` (add `ffmpeg-static`)

**Interfaces:**
- Produces, `src/app/video-tools.ts`:
  - `downloadToFile(url: string, path: string): Promise<void>` — `fetch`, throws `Error("download failed: <status>")` on non-2xx, writes the body to `path`.
  - `inspectLocalVideo(path: string): Promise<{ faststart: boolean; bitrate: number | null }>` — first 262 144 bytes → `atomsAreFaststart`; `ffmpeg -hide_banner -i <path>` via `execFile` (it exits 1 with no output file; take `stderr` from the error) → `parseInputBitrate`.
  - `encodeVideo(inPath: string, outPath: string): Promise<void>` — `execFile(ffmpegBinary(), ffmpegArgs(inPath, outPath))`.
  - `ffmpegBinary(): string` — the default export of `ffmpeg-static`; throws `Error("ffmpeg-static has no binary for this platform")` if it is null.

- [ ] **Step 1: Install** `npm install ffmpeg-static@5.3.0`. In `next.config.ts` set `serverExternalPackages: ["ffmpeg-static"]` and `outputFileTracingIncludes: { "/api/tracks": ["./node_modules/ffmpeg-static/ffmpeg"] }`.

- [ ] **Step 2: Write the failing integration test** (real ffmpeg-static, synthetic 1 s clip, so it runs anywhere `npm install` ran):

```ts
// generates a non-faststart 64x64 clip with ffmpeg-static, then checks both functions on it
it("detects a non-faststart clip and produces a conforming one", async () => {
  const src = join(dir, "src.mp4"), out = join(dir, "out.mp4");
  await execFileP(ffmpegBinary(), ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=10",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-c:a", "aac", "-shortest", src]);
  const before = await inspectLocalVideo(src);
  expect(before.faststart).toBe(false);
  expect(typeof before.bitrate).toBe("number");
  await encodeVideo(src, out);
  const after = await inspectLocalVideo(out);
  expect(after.faststart).toBe(true);
  expect(needsReencode(after)).toBe(false);
}, 30_000);
it("downloadToFile rejects a non-2xx response", ...)   // stub global fetch → { ok:false, status:404 }
```

- [ ] **Step 3: Run** `npx vitest run src/app/video-tools.test.ts` → FAIL.

- [ ] **Step 4: Implement** `video-tools.ts` importing `ffmpegArgs`, `atomsAreFaststart`, `parseInputBitrate` from `../../scripts/video-recipe.mjs`.

- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run lint && npm run build` → pass; the build must not complain about `ffmpeg-static`.

- [ ] **Step 6: Commit** — `feat: wrap ffmpeg-static for the server, sharing the script's recipe`.

---

### Task 5: The re-encode job

**Files:**
- Create: `src/app/reencode-job.ts`
- Create: `src/app/reencode-job.test.ts`

**Interfaces:**
- Consumes: `video-tools.ts` (Task 4), `reencode-marks.ts` (Task 3), `track-blobs.ts` (Task 1), `newPathnameFor`/`needsReencode` (Task 2), `put`/`del` from `@vercel/blob`.
- Produces: `runReencodeJob(id: string, blobUrl: string): Promise<void>` — never rejects.

Behaviour, in order (spec "How it behaves" 3–6):
1. `mkdtemp`, download `blobUrl` to `<tmp>/<id>.in.mp4`, inspect.
2. Conforming → `clearReencodeMark(id)`, done.
3. Else `encodeVideo` → `put(newPathnameFor(id, oldPathname), fileBuffer, {…Global Constraints options…})` where `oldPathname` is `new URL(blobUrl).pathname` without the leading `/`.
4. `setTrackBlobUrl(id, newUrl)`, then `clearReencodeMark(id)`, then `del(blobUrl)` if the pathname changed. A `del` failure is `console.error`-ed and otherwise ignored.
5. Any other throw → `console.error(err)` and `recordReencodeError(id, message)`; if that itself throws, `console.error` only.
6. `finally`: `rm` the temp dir.

- [ ] **Step 1: Write the failing tests**, mocking `./video-tools`, `./reencode-marks`, `./track-blobs`, `@vercel/blob` with `vi.mock`, and `inspectLocalVideo` returning a chosen `{faststart, bitrate}`:

```ts
it("clears the mark and uploads nothing for a conforming video", ...)       // inspect→{true, 1_200_000}; put not called; clearReencodeMark("x")
it("re-encodes, uploads to videos/<id>.mp4, repoints, clears, deletes", async () => {
  // inspect→{false, 5_500_000}; blobUrl "https://s.public.blob.vercel-storage.com/tracks/x.mp4"
  expect(put).toHaveBeenCalledWith("videos/x.mp4", expect.anything(),
    { access: "public", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true });
  // call order: setTrackBlobUrl("x", newUrl) → clearReencodeMark("x") → del(blobUrl)
});
it("records the error when the download fails", ...)                        // downloadToFile rejects; recordReencodeError("x", /download failed/); setTrackBlobUrl & put not called
it("leaves tracks:blobs alone when the upload fails", ...)                  // put rejects; setTrackBlobUrl, clearReencodeMark, del not called; recordReencodeError called
it("clears the mark even when deleting the original fails", ...)            // del rejects; clearReencodeMark called; recordReencodeError not called; console.error called
it("does not reject when recording the error fails", ...)                   // recordReencodeError rejects; await runReencodeJob resolves
```

- [ ] **Step 2: Run** `npx vitest run src/app/reencode-job.test.ts` → FAIL.

- [ ] **Step 3: Implement** `reencode-job.ts`.

- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint` → pass.

- [ ] **Step 5: Commit** — `feat: re-encode job that swaps a track's blob and clears its mark only on success`.

---

### Task 6: Wire the job into `POST /api/tracks`

**Files:**
- Modify: `src/app/api/tracks/route.ts`
- Modify: `src/app/api/tracks/route.test.ts`

**Interfaces:**
- Consumes: `markReencoding` (Task 3), `runReencodeJob` (Task 5), `after` from `next/server`.
- Produces: `export const maxDuration = 300;` on the route.

- [ ] **Step 1: Extend the tests.** Add mocks beside the existing `addTrackMock`:

```ts
const markMock = vi.fn(async () => undefined);
const jobMock = vi.fn(async () => undefined);
const afterMock = vi.fn((cb: () => unknown) => { void cb(); });
vi.mock("../../reencode-marks", () => ({ markReencoding: markMock }));
vi.mock("../../reencode-job", () => ({ runReencodeJob: jobMock }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: afterMock }));
```
and assertions: on success, `markMock` called with `"may-song-bread"` **before** the response is returned and `jobMock` called with `("may-song-bread", blobUrl)` via `afterMock`; on 401 and 400 neither is called. New test: `it("exports maxDuration = 300")`.

- [ ] **Step 2: Run** `npx vitest run src/app/api/tracks/route.test.ts` → FAIL.

- [ ] **Step 3: Implement**: after `await addTrack(track, blobUrl)`, `await markReencoding(id)`, then `after(() => runReencodeJob(id, blobUrl))`, then the existing JSON reply. Add `export const maxDuration = 300;`.

- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint` → pass.

- [ ] **Step 5: Commit** — `feat: mark and re-encode a Shortcut upload after replying to the phone (#31)`.

---

### Task 7: ⚠️ on the Practice page

**Files:**
- Modify: `src/app/PracticeTasksList.tsx:14-24` (props), `:81-90` (title row)
- Modify: `src/app/RotatingItem.tsx:11-24` (props), `:69` (row name)
- Modify: `src/app/page.tsx:41-48` (load marks), `:138-146` (pass prop)
- Modify: `src/app/PracticeTasksList.test.tsx`, `src/app/RotatingItem.test.tsx`

**Interfaces:**
- Produces: optional prop `reencodingIds?: string[]` (default `[]`) on `PracticeTasksList` and `RotatingItem`; `PracticeTasksList` forwards it to `RotatingItem`.
- The marker element: `<span role="img" aria-label="Video not yet re-encoded">⚠️</span>`, placed immediately after the name (`<h3>` title in `PracticeTasksList`; the `font-medium` name span in `RotatingItem`), shown when the item's resolved track ID (or the row's track ID) is in `reencodingIds`.

- [ ] **Step 1: Write the failing tests**:

```ts
// PracticeTasksList.test.tsx
it("shows ⚠️ beside an item whose track is still being re-encoded", () => {
  render(<PracticeTasksList items={[{ trackChoices: ["a"], tasks: [], dice: false }]} tracks={TRACKS} ... reencodingIds={["a"]} />);
  expect(screen.getByRole("img", { name: "Video not yet re-encoded" })).toBeTruthy();
});
it("shows no ⚠️ when nothing is marked", ...)   // queryByRole → null
// RotatingItem.test.tsx
it("shows ⚠️ only on the marked pool track", ...) // reencodingIds={["p2"]}; exactly one img; it sits in p2's row (within(row))
```

- [ ] **Step 2: Run** the two test files → FAIL (unknown prop / no element).

- [ ] **Step 3: Implement** the two components. In `page.tsx`, add `getReencodeMarks()` to the `Promise.all` and pass `reencodingIds={Object.keys(reencodeMarks)}`.

- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint` → pass. Then `npm run dev`, put `{"ant-song-teacher-demo":{"since":"2026-11-14T00:00:00Z"}}` in `data/track-reencode.json`, open `/` with a plan containing that video, confirm the ⚠️, then restore `{}`.

- [ ] **Step 5: Commit** — `feat: show ⚠️ on the Practice page for videos not yet re-encoded`.

---

### Task 8: ⚠️ on the Plans page

**Files:**
- Modify: `src/app/plans/PlanEditor.tsx:40-50` (props), `:231`, `:272` (forward)
- Modify: `src/app/plans/TrackPicker.tsx:13-33` (props), `:119` (name)
- Modify: `src/app/plans/PracticeItemRow.tsx:27-46` (props), `:147-156` (pool chip name)
- Modify: `src/app/plans/page.tsx:16-23`, `:58`
- Modify: `src/app/plans/PracticeItemRow.test.tsx`, `src/app/plans/PlanEditor.test.tsx`

**Interfaces:**
- Consumes: `getReencodeMarks` (Task 3).
- Produces: optional prop `reencodingIds?: string[]` (default `[]`) on `PlanEditor`, `TrackPicker`, `PracticeItemRow`. Same marker element as Task 7, placed after `{trackName(id)}` inside the pool chip button and after `{t.name}` inside the picker row button.

- [ ] **Step 1: Write the failing tests**:

```ts
// PracticeItemRow.test.tsx
it("shows ⚠️ on a marked pool track", ...)                       // reencodingIds={["a"]}; getByRole("img", {name:"Video not yet re-encoded"})
it("ignores marked IDs that are not in the list", ...)          // reencodingIds={["ghost"]}; queryByRole → null, heading still "Track A"
// PlanEditor.test.tsx (TrackPicker is reached through the editor's + button)
it("shows ⚠️ beside a marked track in the picker", () => {
  render(<PlanEditor plan={PLAN} tracks={[{ id: "v", name: "Vid", type: "video", file: "/api/v/v" }]} frozen={false} printable reencodingIds={["v"]} />);
  fireEvent.click(screen.getByRole("button", { name: /add practice/i }));
  expect(screen.getByRole("img", { name: "Video not yet re-encoded" })).toBeTruthy();
});
```
(Check `PlanActionBar.tsx` for the + button's accessible name before writing the click.)

- [ ] **Step 2: Run** the two test files → FAIL.

- [ ] **Step 3: Implement** the three components and `plans/page.tsx` (add `getReencodeMarks()` to its `Promise.all`, pass `reencodingIds={Object.keys(marks)}` to `PlanEditor`).

- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint` → pass.

- [ ] **Step 5: Commit** — `feat: show ⚠️ in the plan editor and track picker for videos not yet re-encoded`.

---

### Task 9: The manual script clears marks

**Files:**
- Modify: `scripts/reencode-videos.mjs` (header comment, mark handling)
- Create: `scripts/reencode-videos.test.mjs` (new, small)

**Interfaces:**
- Produces: `export function dropMarks(marks, ids)` in `reencode-videos.mjs` → a new object without the given IDs, `{}` for a non-object `marks`.
- `main()` reads `tracks:reencode` once. On `--execute`, after the audit it writes `dropMarks(marks, conformingMarkedIds)` and logs each cleared ID; after each successful swap it drops that ID too and writes. In dry-run it prints `would clear mark: <id>` instead of writing.

- [ ] **Step 1: Write the failing tests**:

```js
it("dropMarks removes only the given ids", () =>
  expect(dropMarks({ a: { since: "t" }, b: { since: "t" } }, ["a"])).toEqual({ b: { since: "t" } }));
it("dropMarks tolerates a non-object store", () => expect(dropMarks(null, ["a"])).toEqual({}));
```

- [ ] **Step 2: Run** `npx vitest run scripts/reencode-videos.test.mjs` → FAIL.

- [ ] **Step 3: Implement**, and rewrite the header comment: drop the "Stopgap … (#32)" line and "(see #26)"; say instead that `POST /api/tracks` re-encodes uploads automatically (#31) and this script is the manual fallback that also clears a stuck ⚠️.

- [ ] **Step 4: Run** `npm test` → pass. Dry-run against prod: `node --env-file=.env.local scripts/reencode-videos.mjs` → audit unchanged, no `would clear` lines (no marks exist yet).

- [ ] **Step 5: Commit** — `feat: reencode-videos.mjs clears a track's ⚠️ mark once the video conforms`.

---

### Task 10: README

**Files:**
- Modify: `README.md:197` (Encode note), `:219-231` (Keeping videos streamable)

- [ ] **Step 1: Edit.** In the 540p note, replace "run `scripts/reencode-videos.mjs` afterward to fully normalize" with: the server re-encodes every Shortcut upload automatically. Rewrite "Keeping videos streamable" to say, in this order: uploads are re-encoded on Vercel right after registration (needs `ffmpeg-static`, bundled); a ⚠️ next to a video's name on the Practice and Plans pages means it has not been re-encoded yet, either because it is still running or because it failed, with the error in Upstash under `tracks:reencode` or in the Vercel logs; the script is the manual fallback and clears the ⚠️. Keep the two command lines.

- [ ] **Step 2: Verify** `grep -n "reencode" README.md` shows the new wording and no leftover "afterward to fully normalize".

- [ ] **Step 3: Commit** — `docs: README describes automatic re-encoding, the ⚠️, and the script as fallback`.

---

### Task 11: Preview smoke test and PR

- [ ] **Step 1: Push** the branch and open a PR with `Closes #31`, describing the mark lifecycle and the preview test below.
- [ ] **Step 2: On the Vercel preview**, upload a short clip via the Shortcut pointed at the preview URL (or `curl` the two routes with the preview's `UPLOAD_TOKEN`). Expect: immediate `{ ok: true }`; ⚠️ visible on `/plans` right after; within ~2 minutes `tracks:blobs` in the preview's Redis points at `videos/<id>.mp4`, the mark is gone, the old `tracks/<id>.mp4` is deleted, and the ⚠️ disappears on reload.
- [ ] **Step 3: Record** the measured encode time and file sizes in the PR body, then hand the PR to Siyuan for review and merge.
