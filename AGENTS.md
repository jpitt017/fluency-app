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

Because the variable *grants* the bypass, never give it job-wide scope in a
workflow that also runs tests: export it on the one release/revoke step that
needs it. A job-wide `ALLOW_PRODUCTION_RELEASE` is inherited by the test step,
where it turns "production must be refused" into a pass-through and the suite
fails with *Missing expected rejection* — that is exactly how course-audio run
45258656177 broke. `tests/unit/listening-audio-approval.test.mjs` now pins the
answer with an explicit `allowProductionRelease: false` and checks the rule holds
for every value of the variable, so it cannot come back silently.

## Never send trial SQL to the live project

**SQL sent through the Supabase connector commits immediately. It does not roll
back, and an explicit `begin;` … `rollback;` around it does not roll it back
either.** The connector does not run your script as one interactive
transaction: `rollback;` is accepted, returns success, and changes nothing.
Whatever the statements before it did is already live.

So the rule is not "be careful with transactions". It is: **never send trial,
probe or exploratory SQL to the live project at all.** Not a `select` that
creates something, not a constraint swap "to see if the pattern matches", not an
insert to check a limit — if the statement can change anything, it does not go
to production unless it is the reviewed migration itself.

This has already gone wrong. A migration was about to be written to widen a
`CHECK` constraint, and the pattern matching the existing constraint was probed
on live first, wrapped in `begin;`/`rollback;`. It committed. Live ended up with
a schema change its migration history did not record, and it took a manual
revert to put back — safe only because the table happened to be empty.

To check what SQL will do, use one of these instead:

1. **A unit test or the replay in CI** — the `Isolated migration and
   learner-data deletion` job replays every migration against a fresh
   `supabase start` database, so a migration that does not apply cleanly fails
   there, not on production. A pattern that has to match an existing constraint
   name can be proven against the replayed schema.
2. **A preview / branch database** — probe freely; nothing is live.
3. **Read-only inspection of live** — `information_schema`, `pg_constraint`,
   `pg_get_constraintdef()` and the `list_migrations` tool are safe, because they
   only read. This is how to discover the real constraint name *without*
   changing it.

Then apply the reviewed migration file itself, once, after telling the owner the
plan, and record it in `supabase_migrations.schema_migrations` so a fresh replay
and live agree.

If you are unsure whether a statement is read-only, it is not.

## This repo's other standing rules

- Read the Next.js guidance block below before writing app code; this Next.js
  version differs from most training data.
- One branch per task, from `main`; open a small PR and let CI run.
- Each new behaviour gets a test. `course-audio` is a **public** bucket, so
  `released` is the only learner-side gate and nothing untested ships there.
- **Before adding a migration, check the newest number on `main`, in
  `supabase_migrations.schema_migrations` on live, and in every open PR that
  touches `supabase-b1-b2/migrations/`** — a version number must be unique
  across all three. Two migrations once claimed `0040` (`ai_failure_alerts`
  and `vocabulary_attempts`): live could record only one, so a fresh replay
  could never reproduce it. `ai_failure_alerts` is now `0045`.
- **For every new migration, use numeric `NNNN_name` and record it in live `supabase_migrations.schema_migrations` under the same numeric version (e.g. `0050`), never a timestamp; leave existing history rows unchanged.**
- **Before applying a migration that replaces a function, save the live
  `pg_get_functiondef(...)` output for comparison.** Capture it before the
  migration runs and keep it with the rollout notes or PR context so the new
  definition can be diffed against what production actually had, not against
  memory or an older repo copy.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
