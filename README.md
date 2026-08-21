# String Steps

An interactive violin practice website for a young student and their parents, designed to make daily practice easy and fun. It's a **single-tenant template**: fork it and deploy your own instance for your family (see [Deploy your own](#deploy-your-own)).

## What It Does

String Steps turns the teacher's weekly practice list into a checklist the student can work through on their own, marking each item done.

### Practice Tracks

Each track can require one or more of the following tasks:

- **Sing with track** — sing along to the audio
- **Practice on violin with track** — play along to the audio
- **Practice on violin without track** — play independently

Each task has a repeat count, and any task can be a **focus drill** — scoped to a specific passage (e.g. *bars 5–8*) so the student knows exactly which part to work on. Some tracks need just one task; others combine several.

### Track Types

- **Audio** — a recording to sing or play along with.
- **Video** — a teacher demo of new notes; supports pause, rewind, and step-through so the student can learn at their own pace.
- **Reference** — a named exercise with no media (e.g. *A Major Scale*), used for play-without-track drills and the practice die.

### Practice Die

Some practice items let the die decide what to play. Each die-enabled item keeps an ordered list of up to six choices — rhythms (e.g. 🍕 *pepperoni pizza*) and/or tracks from the item's pool — and tapping the item's **🎲** summons a big shared die: the rolled number picks the matching choice (rolling past the end of the list means "roll again!"). A rolled track switches the whole item — audio, tap targets, notes — to that track. See the [implementation plan](docs/superpowers/plans/2026-07-21-shared-practice-die.md).

### Get Ready Checklist

A configurable checklist to run through before playing, defined declaratively in
[data/checklist-items.json](data/checklist-items.json). The teacher adjusts it
periodically based on the student's progress.

Each entry is:

| field | meaning |
|---|---|
| `id` | stable key; also the `/api/img/<id>` and `checklist:blobs` key |
| `description` | the reminder text shown under the icon |
| `category` | `violin-hand` \| `bow-hand` \| `other` — groups items into a labeled row |
| `emoji` | shown **when the item has no image** (see below) |
| `image` | seed path; the live image is served from Vercel Blob via `/api/img/<id>` |

**The image is optional.** At render time the app looks up the item's `id` in the
`checklist:blobs` Redis map (the `/api/img/<id>` route resolves it from Blob). If
there's an uploaded image, it renders the photo; if **not**, it renders the item's
`emoji` instead. So a fresh deployment with no images shows a friendly emoji
checklist out of the box, and you can add a photo per item later by uploading it
(`scripts/migrate-checklist-images.mjs`) without touching this file's structure.

Current example (the committed demo seed):

- 🐭 Three mouse holes on the bow hand
- 🐻 Baby bear gesture on the violin hand
- ☝️ First finger down at the edge of the tape
- 🤗 Two hugger fingers on the bow
- 🐶 Space for a puppy in the bow hold

### Calendar

The **Calendar** tab shows each day at a glance — how much of that day's plan was completed, plus class days and sick days — and lets the student open any day to practice it.

### Plans

The **Plans** tab is where the week's practice is built: create a plan, add practice items with their tasks (sing / play / focus drills), give an item a pool of tracks and a die with its choice list, set the Get Ready checklist, and choose the date it becomes active. Past plans are frozen so practice history stays intact.

### Track Notes

While practicing, the student can add a short note to any track (how it went, what was tricky). Notes are saved per track per day and feed the Teacher view.

### Teacher View

The **Teacher** tab gives the teacher a read-only summary of recent practice — the tracks worked on and any notes — covering the stretch since the last class day.

### Linked Accounts (opt-in)

By default a deployment shows a **single student** — no account switcher, no "Practicing as …" banner.

Optionally, the roster can include a **linked account** — e.g. a parent who practices too. To enable it, add a second entry to the `students:list` array in Redis with `"kind": "linked"` and `"linkedTo": "<primary id>"`, for example:

```json
{ "id": "parent", "name": "Mama Bear", "emoji": "🐻", "kind": "linked", "linkedTo": "mozart-x" }
```

Once a linked account exists, a name chip appears in the tab bar to switch between accounts; each keeps its own practice history. The linked account works through the same plan (with a "Practicing as …" banner) but doesn't see the Teacher tab or track notes — those stay with the student.

### The weekly rhythm

The four tabs form a loop around each lesson:

1. **Plans** — during or after a lesson, the parent builds that week's plan from the teacher's feedback. A new plan starts from the current one: swap out tracks, add or adjust tasks, and pick the date it becomes active.
2. **Practice** — each day the student opens that day's practice, runs the checklist, works through each track's tasks, marks them done, and adds track notes.
3. **Calendar** — shows the month's practice at a glance; page back to review past months.
4. **Teacher** — at the next lesson the teacher reviews what was practiced and the notes since last time, and gives the feedback that shapes the next plan — back to step 1.

## Local Development

Requires **Node 20.9+** (the floor declared by Next.js 16).

```bash
npm install
cp .env.example .env.local   # then set APP_PASSCODE to any value for local use
npm run dev                  # http://localhost:3000
```

Open http://localhost:3000 and log in with your `APP_PASSCODE`.

**Locally, `APP_PASSCODE` is the only variable you need** — set it to anything and leave the rest of `.env.local` blank. With no Redis, the app reads and writes the committed `data/*.json` seed files (it ships a demo plan + a CC-BY-SA play-along track, so a fresh clone works immediately). With no Blob, the checklist shows its emoji fallback and there's simply no uploaded media to play. Add Redis/Blob locally only if you want to develop against them — see [Environment variables](#environment-variables) for what each one does.

**Checks:**

```bash
npm test            # vitest
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
```

### Repo tooling (`.claude/`)

`.claude/settings.json` is [Claude Code](https://claude.com/claude-code) project config — it enables the Superpowers plugin used while developing this app. It has no effect on the running app; ignore or delete it if you don't use Claude Code.

## Environment variables

All configured in `.env.local` for local dev, and in the Vercel project settings for a deployment (see [.env.example](.env.example)):

| Variable | Local dev | Deployment | Purpose |
|---|---|---|---|
| `APP_PASSCODE` | **required** | **required** | Shared passcode that gates the whole app — it errors on boot if unset. |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | optional | **required** | Upstash Redis storage (plans, schedule, tracks, practice log, people). Optional locally — falls back to the `data/*.json` files. **Required in production:** Vercel's filesystem is read-only at runtime, so without Redis any save (marking tasks done, notes, plan edits) fails. |
| `BLOB_READ_WRITE_TOKEN` | optional | optional | Vercel Blob — serves and stores media (audio, video, checklist images). Without it: emoji-checklist fallback and no media. |
| `UPLOAD_TOKEN` | optional | optional | Bearer token for the video-upload routes (`/api/tracks*`). Only needed if you add videos via a Shortcut. |

**In short:** local dev needs only `APP_PASSCODE`; a real deployment needs `APP_PASSCODE` **and** an Upstash Redis store, plus Vercel Blob if you want media.

## Deploy your own

String Steps is single-tenant — each deployment is one family's instance. To run your own:

1. **Fork** this repo (or clone and push it to your own GitHub).
2. **Create a Vercel project** from the repo. It's a Next.js app, so the defaults work.
3. **Add an Upstash Redis store (required)** — via the Vercel Marketplace (Storage → Upstash) or at [upstash.com](https://upstash.com). Put its REST URL and token into the Vercel project's environment variables as `KV_REST_API_URL` and `KV_REST_API_TOKEN`. (Required because Vercel's runtime filesystem is read-only — all writes go to Redis.)
4. **Add a Vercel Blob store (optional, for media)** — Vercel dashboard → Storage → Blob. Put its read-write token into `BLOB_READ_WRITE_TOKEN`. Skip it and the app runs without media (emoji checklist, no audio/video).
5. **Set the env vars in Vercel** — in your project on [vercel.com](https://vercel.com), open **Settings → Environment Variables** and add the Redis/Blob values from steps 3–4 plus (see [.env.example](.env.example)):
   - `APP_PASSCODE` — the shared password that gates the whole app.
   - `UPLOAD_TOKEN` — a long random string for the video-upload routes (generate with `openssl rand -hex 32`; only needed if you use the upload flow).

   Re-deploy after changing environment variables so they take effect.
6. **Deploy.** On first load you'll hit the passcode gate; after logging in, the app boots from the committed demo seed, so it works right away — one sample plan with a play-along track and the emoji checklist.
7. **Make it yours.** Edit the live data in the Upstash console — the student/teacher roster (`students:list`, `teacher:info`), plans (`plans:list`), schedule (`schedule:map`), and tracks (`tracks:list`) — and add your own media (see below). The committed `data/*.json` files only seed **empty** Redis keys, so changing them later never overwrites a populated production store.

> **De-identification.** Real names live only in your production Redis. The repo ships fictional defaults — Mozart X / Mama Bear / Mr. G in [data/students.json](data/students.json) and [data/teacher.json](data/teacher.json) — so nothing personal is committed.

## Adding a teacher demo

Teacher-demo videos live in Vercel Blob and are registered in Redis; the app serves them behind the passcode gate via `/api/v/<id>`. The easiest way to add one from an iPhone is a small iOS Shortcut you build yourself — there's no shared link, since it has to embed *your* deployment URL and upload token. If you'd rather not build a Shortcut, use the [ffmpeg recipe](#manual-mac--ffmpeg) below.

### Build your own upload Shortcut (iOS)

First set an `UPLOAD_TOKEN` env var on your deployment — a long random string. Generate one with `openssl rand -hex 32` (or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). The two upload routes authenticate with `Authorization: Bearer <UPLOAD_TOKEN>`. Then, in the Shortcuts app, create a Shortcut that **receives video from the share sheet** and runs these actions (store your own values in the two Text actions at the top):

1. **Text** → your deployment URL (e.g. `https://your-app.vercel.app`) → **Set Variable** `SERVER_URL`.
2. **Text** → your `UPLOAD_TOKEN` → **Set Variable** `UPLOAD_TOKEN`.
3. **Ask for Input** ("Track name?") → **Set Variable** `NAME`.
4. **Encode Media** → size **540p (960×540)**, H.264 (see the note below).
5. **Get Contents of URL** → `POST {SERVER_URL}/api/tracks/upload-url`, header `Authorization: Bearer {UPLOAD_TOKEN}`, JSON body `{ "name": NAME }`. Returns `{ id, uploadUrl, clientToken, uploadHeaders, blobUrl }`.
6. **Get Contents of URL** → `PUT {uploadUrl}` with the encoded video as the file body, the returned `uploadHeaders`, plus `Authorization: Bearer {clientToken}`. Uploads straight to Vercel Blob.
7. **Get Contents of URL** → `POST {SERVER_URL}/api/tracks`, header `Authorization: Bearer {UPLOAD_TOKEN}`, JSON body `{ "id": id, "name": NAME, "blobUrl": blobUrl }`. Registers the track in Redis.
8. **Show Notification** → "Uploaded {NAME}".

The exact request/response shapes are the source of truth in [src/app/api/tracks/upload-url/route.ts](src/app/api/tracks/upload-url/route.ts) and [src/app/api/tracks/route.ts](src/app/api/tracks/route.ts).

> **Encode at 540p, not 720p.** iOS's hardware encoder runs at a high bitrate regardless of size — 720p produced ~11 Mbps files that buffered; 540p roughly halves it at the same 16:9 framing. iOS `Encode Media` also can't write a faststart MP4, so this only mitigates the problem — run `scripts/reencode-videos.mjs` afterward to fully normalize (see [below](#keeping-videos-streamable-audit--re-encode)).

### Using the Shortcut

1. In **Photos**, open the demo clip → tap **Share** → choose your Shortcut.
2. Type a track name (e.g. *May Song - Bread - Teacher Demo*) when prompted.
3. Wait for the upload notification. The new track appears in `/plans` on next page load.

### Manual (Mac + ffmpeg)

Encode a streaming-friendly MP4, then upload it to your Blob store and add a matching entry to `tracks:list` in Redis:

```bash
ffmpeg -i input.mov \
  -vcodec libx264 -crf 28 -preset medium -vf "scale=-2:720" \
  -acodec aac -b:a 128k \
  -movflags +faststart \
  output.mp4
```

Knobs: bump `-crf` (e.g. 30–32) for smaller files at lower quality, drop `-vf "scale=-2:720"` to keep the source resolution, or change `-2:720` to `-2:480` for an even smaller file.

### Keeping videos streamable (audit + re-encode)

iPhone uploads can land at a high bitrate or without `faststart`, which makes them buffer instead of streaming cleanly (iOS's encoder can't fix either). `scripts/reencode-videos.mjs` audits the videos already in your deployment and re-encodes any that aren't streaming-ready:

```bash
# Audit only — lists every video and flags any that aren't streaming-ready
node --env-file=.env.local scripts/reencode-videos.mjs

# Fix — re-encode just the flagged ones and swap them on Blob
node --env-file=.env.local scripts/reencode-videos.mjs --execute
```

It flags any video that isn't `faststart` or exceeds **2.5 Mbps**, re-encodes those to 720p / `faststart` / ~1.2 Mbps (no upscaling), uploads to a fresh Blob path, repoints Redis, and deletes the old file. Requires `ffmpeg`/`ffprobe` installed and the `KV_REST_API_*` + `BLOB_READ_WRITE_TOKEN` env vars (i.e. your `.env.local`). Safe to run anytime — it only touches non-conforming videos.
