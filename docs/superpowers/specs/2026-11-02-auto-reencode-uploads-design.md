# Auto re-encode phone uploads: design

Issue: [#31](https://github.com/sjiang1/string-steps/issues/31). Related: [#25](https://github.com/sjiang1/string-steps/issues/25) (Vercel plan).

## Why

Videos uploaded through the iPhone Shortcut reach Vercel Blob at about 5.5 Mbps and without faststart, because iOS `Encode Media` can't do better. Nothing fixes them unless someone remembers to run `scripts/reencode-videos.mjs`. Three such files sat in the daily plans for weeks and are the likely cause of hitting the 10 GB Blob transfer limit (#25). Re-encoding shrinks them about 12×.

## Goals

- A phone upload gets re-encoded automatically, with no Mac step.
- If that fails for any reason, including a crash or timeout, a visible ⚠️ appears until it's fixed.
- A failure can only leave a video big. It must never leave a video lost or broken.

## Non-goals

- Audio files.
- Videos added from the Mac (`scripts/add-recordings.mjs`). They're converted before upload.
- Automatic retries. A failure shows the ⚠️, and the fix is the manual script.
- Choosing a Vercel plan (stays in #25).
- Changing the Shortcut.

## Anti-goals

- Anything that makes the phone wait for encoding or changes the Shortcut flow.
- Storing production keys in GitHub or adding another system (GitHub Actions was rejected because the repo is public).
- Words or tap targets on the warning. Xiami sees it too, so it's only a symbol.

## Decided by Siyuan

- **Timing doesn't matter.** After uploading, she builds a plan before Xiami ever watches the video, so a minute or two of waiting is fine. The track ID doesn't change in the swap, so plans made during encoding keep working.
- **Warning:** a plain ⚠️ next to the video's name on the **Practice page**, the page she uses most. No text and nothing to tap.
- **When she sees one:** she debugs why it wasn't re-encoded, then runs the script by hand.
- **Run on Vercel, not GitHub Actions.**

## Spike result (2 Nov 2026)

A throwaway route ran on a Vercel preview with `ffmpeg-static`, using the same ffmpeg settings as the script, on a 58-second 5.5 Mbps clip:

| | Replying with the result | Inside `after()`, once the reply was sent |
|---|---|---|
| Encode time | 51.1 s | 50.9 s |
| Size | 40.1 MB → 3.6 MB | 40.1 MB → 3.6 MB |

- Encoding takes about real time, so the 300 s function limit fits clips up to roughly 5 minutes. Longer clips time out and show the ⚠️.
- `after()` work did run to completion after the response was sent.
- Bundling needed `serverExternalPackages: ["ffmpeg-static"]` and `outputFileTracingIncludes` pointing at `./node_modules/ffmpeg-static/ffmpeg`.
- The preview reported 2 CPUs and 2.4 GB. The account is on Pro today. Vercel documents Hobby and the Pro default as the same 1 vCPU / 2 GB, but it hasn't been measured on Hobby.
- Quota: Hobby includes 4 CPU-hours a month. At about 1 CPU-minute per clip, that's far more than the upload rate needs.
- The 300 s limit was measured on Pro. If #25 ends in a move to Hobby, confirm the function duration limit there before relying on it.

## How it behaves

1. `POST /api/tracks` saves the track as it does today, **and** records a mark for it in Redis, before replying.
2. The route replies to the phone at once, and continues in `after()`, with `maxDuration = 300`.
3. The job downloads the file and checks it. If it's already faststart and at most 2.5 Mbps, it clears the mark and stops.
4. Otherwise it re-encodes with the script's settings (720p at most with no upscaling, CRF 28, AAC 128k, faststart) and uploads to a new path, `videos/<id>.mp4`, so no cached copy of the old file is served.
5. Only after that upload succeeds, it points `tracks:blobs` at the new file, clears the mark, and deletes the original. Failing to delete the original must not bring back the ⚠️; log it instead.
6. If anything throws, the original stays in place, and the error message is saved on the mark and logged with `console.error`.

**Why a mark instead of a "failed" flag:** a killed function can't report anything. Writing the mark first and clearing it only on success means a crash or timeout still shows the ⚠️. As a result, the ⚠️ also shows during the minute or two of encoding. That's accepted.

**The mark:** a new Redis key, `tracks:reencode`, mapping track ID to `{ since: <ISO time>, error?: <message> }`. Local dev uses a file, like the other keys that go through `readJson`/`writeJson`.

**Showing it:** a plain ⚠️ next to a marked video's name:
- On the Practice page, in `PracticeTasksList` and `RotatingItem`.
- On the Plans page, in `TrackPicker` and `PracticeItemRow` (Claude's call, so she notices before adding the video to a plan).
- Not on the print handout (`plans/print`). Nothing can be done about it from paper.

All four components already receive the full `tracks` array from their page, so the pages pass a set of marked IDs alongside it.

The saved error isn't shown in the app. She reads it in the Upstash console or the Vercel logs.

**The manual script:** `reencode-videos.mjs --execute` clears a track's mark after swapping it. It also clears the mark on a video that it finds already conforming, so a fixed track can't keep its ⚠️.

**Leftover marks:** the app has no way to delete a track (removing one from a plan item only detaches it), so a mark can outlive nothing. If a track ever disappears from `tracks:list`, its mark is ignored and does no harm.

## Claude's calls (please check)

- ⚠️ also appears on the Plans page, as well as the Practice page.
- ⚠️ does not appear on the print handout.
- If the job can't save the error because Redis itself is failing, the mark from step 1 still stands and the error goes to the logs only.
- Reuse the script's logic rather than copying it: keep one definition of the ffmpeg arguments, the conformance check and the new-path rule, shared by the script and the route.

## Left to the builder

- Where the shared logic lives, given the script is `.mjs` run directly by Node and the route is TypeScript.
- `readJson`/`writeJson` are private to `actions.ts`. Move them to a plain module (no `"use server"`) so the job can use them without living in `actions.ts`. `actions.ts` keeps importing them from there.
- Local dev reads the mark from a JSON file and throws if it's missing, so commit `data/track-reencode.json` holding `{}`, like `data/track-blobs.json`.
- How to measure bitrate without `ffprobe`, which `ffmpeg-static` doesn't include (for example, size ÷ the duration in ffmpeg's output).
- Keep job code out of `actions.ts`: every export of that `"use server"` file becomes a callable endpoint.
- Avoid overwriting a concurrent change: re-read `tracks:blobs` right before writing it, rather than using a copy read before the encode.
- Tests, in line with the project's Vitest setup, mocking ffmpeg and Blob at the boundary. The existing `api/tracks/route.test.ts` mocks `actions` only; it will also need `after` from `next/server` mocked.
- `next.config.ts` is empty today; add the two bundling settings from the spike.

## Docs to update

- README "Adding a teacher demo": say uploads are re-encoded automatically, what the ⚠️ means, and that the script is the manual fallback.
- The "stopgap" comment at the top of `reencode-videos.mjs`, and its references to issue numbers that don't exist in this repo.
