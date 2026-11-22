# Agent instructions

## Never release a week on production, not even briefly

**A week may never be marked `released` on the production project — not for a
test, not for a moment, not "just to check the guard".** `released = true` is
what makes a real learner hear a track and what changes `/week/[n]` from "Audio
coming soon." There is no safe window: the page is live, and a browser can load
it between two statements.

This applies to every route into that flag:

- `update public.listening_audio_trials set released = true …` via the Supabase
  connector or the SQL editor;
- `node scripts/generate-course-audio.mjs --release <n>`;
- the **Course audio — AI trial tracks** workflow with `mode: release`.

To verify approval behaviour, use one of these instead:

1. **Unit tests** — `resolveTrialAudio()`, `releaseTrial()`, `assertNotReleased()`
   and the delete guards are all pure or client-injected, so they can be
   exercised with a fake client. This is the default.
2. **A preview / branch database** — release the fake row there and point the
   pipeline at it.
3. **A fake week number learners cannot open** — e.g. week 31. Every page path
   outside Weeks 1–4 stays "Audio coming soon." regardless of the flag, and
   `resolveTrialAudio()` fails closed for unscheduled weeks.

If a guard can only be demonstrated by writing to production, the guard is not
tested enough — write the fake-client test. See
[`docs/CONTENT_PIPELINE.md`](docs/CONTENT_PIPELINE.md) §6, "Approval rules".

The scripts enforce part of this themselves: `release` and `revoke` refuse a
production target unless `ALLOW_PRODUCTION_RELEASE=1` is set, so an ad-hoc local
command cannot flip a live week by accident. The workflow additionally needs the
`allow_production_release` checkbox **and** the phrase `release to learners` in
`production_ack`; do not set either one to "see if it works".

## This repo's other standing rules

- Read the Next.js guidance block below before writing app code; this Next.js
  version differs from most training data.
- One branch per task, from `main`; open a small PR and let CI run.
- Each new behaviour gets a test. `course-audio` is a **public** bucket, so
  `released` is the only learner-side gate and nothing untested ships there.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
