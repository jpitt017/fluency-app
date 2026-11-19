# English B1 → B2: Independent User — Supabase project

New Supabase project provisioned from `English fluency Course Architecture.pdf`.

| | |
|---|---|
| **Project name** | English Fluency B1-B2 |
| **Project ref** | `ebzmkhrssgnzmixfsuso` |
| **API URL** | `https://ebzmkhrssgnzmixfsuso.supabase.co` |
| **Region** | `eu-west-1` (Ireland) |
| **Plan** | free |
| **Status** | `ACTIVE_HEALTHY` (db, auth, rest, storage) |
| **Created** | 2026-11-19 |

> **Free-tier slot:** the organisation was already at its two-project limit, so the
> near-empty project `jpitt017@gmail.com's Project` (`xuuokyvyokxigoiekxrr`, 2 tables,
> 1 row) was **paused**, not deleted, to make room. Restore it from the dashboard
> whenever you like — but a third active free project requires pausing or upgrading
> another one first.

---

## What is in it

A complete, queryable implementation of the course architecture: eight modules,
64 lessons, a five-block daily flow, 640 practice items, 84 curated vocabulary
items with spaced repetition, 16 listening/reading inputs, 24 speaking tasks,
8 writing tasks with guided workflows, 4 checkpoints and 5 badges.

| Table | Rows | Purpose |
|---|---:|---|
| `courses` | 1 | Course metadata, daily flow, skill balance |
| `modules` | 8 | Module map, grammar focus, vocabulary topic |
| `lessons` | 64 | Objective, can-do statement, primary skill, XP |
| `lesson_blocks` | 320 | The 5 daily blocks (warm-up → feedback) per lesson |
| `practice_items` | 640 | 10 interactive items per lesson (2 grammar + 8 vocabulary) |
| `content_inputs` | 16 | Listening transcript or reading text + questions |
| `speaking_tasks` | 24 | 3 per module: prompt card, role-play, shadowing |
| `writing_tasks` | 8 | One per module, with the 5-step writing workflow |
| `vocab_decks` / `vocab_items` | 8 / 84 | Topic decks, 8-item window per lesson |
| `lesson_vocab` | 512 | Lesson ↔ vocabulary mapping |
| `checkpoints` | 4 | B1 consolidation, mid-course, B2 readiness, final |
| `badges` | 5 | From the architecture's badge list |

Learner-side tables: `profiles`, `enrollments`, `lesson_progress`,
`practice_attempts`, `vocab_cards`, `vocab_reviews`, `speaking_attempts`,
`writing_submissions`, `checkpoint_attempts`, `xp_events`, `skill_levels`,
`user_badges`, `weekly_reports`, `daily_sessions`.

Storage: private bucket **`speaking-recordings`**, 25 MB limit, audio MIME types
only, objects scoped to `<user-id>/…`.

---

## Design decisions worth knowing

**All tables live in `public`.** The Supabase REST API exposes `public` by default,
so `supabase-js` can reach every table without changing API settings. Curriculum
tables are read-only for clients (`select` policies only); authored content is
written by migrations, never by the app.

**RLS is the security boundary.**
- `anon` reads `courses`, `modules`, `badges` only — enough for a landing page.
- `authenticated` reads the full curriculum (answers included, for instant feedback).
- Every learner table is `user_id = auth.uid()` for select/insert/update/delete.
- `xp_events`, `skill_levels`, `user_badges`, `profiles` are read-only to clients;
  scores are written by triggers and definer-scoped RPCs, so XP cannot be minted
  or edited from the browser.

**XP, bands and streaks are server-side.** `award_xp()` is revoked from `anon` and
`authenticated` and is only called from triggers and definer functions
(`review_vocab_card`, `evaluate_badges`). Bands follow the architecture ladder:

| Band | XP |
|---|---|
| `B1_low` | 0–599 |
| `B1_mid` | 600–1399 |
| `B1_high` | 1400–2399 |
| `B1_plus` | 2400–3599 |
| `B2_entry` | 3600–4999 |
| `B2_developing` | 5000–6799 |
| `B2_solid` | 6800+ |

XP sources: lesson 20, speaking 40, writing 45, vocabulary review 1–3,
7-day streak 50, checkpoint 150, badge 50–100.

**Spaced repetition** follows the architecture's 1 / 3 / 7 / 14 / 30 (then 60)
day ladder. `review_vocab_card(card_id, grade)` accepts `again | hard | good | easy`:
`good` climbs one rung, `easy` climbs two, `hard` asks again tomorrow, `again`
resets to one day and lowers the ease factor.

**Lesson practice items are protected.** Re-seeding rebuilds lessons, blocks and
items, but a lesson that already has `practice_attempts` keeps its items, so
re-running the seed never orphans learner history.

---

## Client usage

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_B1B2_URL!,
  process.env.SUPABASE_B1B2_PUBLISHABLE_KEY!,
  { auth: { persistSession: true } }
)

// Today: next lesson + due cards + XP in one round trip
const { data: dashboard } = await supabase.rpc('get_learner_dashboard')

// Vocabulary warm-up
await supabase.rpc('ensure_vocab_cards')            // create cards for new decks
const { data: due } = await supabase.rpc('get_due_cards', { p_limit: 10 })
await supabase.rpc('review_vocab_card', { p_card_id: due![0].card_id, p_grade: 'good' })

// A lesson: five blocks, ten items, one output
const { data: lesson } = await supabase
  .from('lessons')
  .select('*, lesson_blocks(*), practice_items(*), lesson_vocab(vocab_items(*))')
  .eq('lesson_number', 1)
  .single()

// Finishing a lesson awards XP, advances the enrollment and touches the streak
await supabase.from('lesson_progress').upsert({
  user_id: (await supabase.auth.getUser()).data.user!.id,
  lesson_id: lesson!.id,
  status: 'completed',
  blocks_completed: 5,
  completed_at: new Date().toISOString(),
})
```

### RPCs

| Function | Purpose |
|---|---|
| `get_learner_dashboard()` | Profile, band, streak, skills, due cards, next lesson, badges |
| `ensure_vocab_cards(p_course_id?)` | Create SRS cards for course vocabulary, returns count created |
| `get_due_cards(p_limit)` | Due cards joined with their vocabulary item and deck |
| `review_vocab_card(p_card_id, p_grade)` | Grade a card; returns next interval, due date and XP |
| `record_activity(p_user, p_day?)` | Streak bookkeeping for the signed-in user |
| `evaluate_badges()` | Award any badges whose criteria are now met |
| `build_weekly_report(p_week_start?)` | Snapshot hours, words, recordings, weakest skill |
| `import_course / import_modules / import_assessments` | Server-only content importer |

Storage upload (audio):

```ts
const path = `${user.id}/${crypto.randomUUID()}.webm`
await supabase.storage.from('speaking-recordings').upload(path, blob)
await supabase.from('speaking_attempts').insert({
  user_id: user.id, task_id, lesson_id, audio_path: path,
  mime_type: 'audio/webm', duration_seconds: 92, status: 'submitted',
})
```

---

## Working with the content

Authored content lives in `content/curriculum/` as JSON — the single source of
truth. The importers expand it into relational rows.

```
content/curriculum/
  course.json            course metadata, 4 checkpoints, 5 badges
  modules-01-02.json     modules 1–2 (grammar, vocab, inputs, tasks, lessons)
  modules-03-04.json
  modules-05-06.json
  modules-07-08.json
migrations/
  0001_schema.sql            enums, curriculum tables
  0002_learner_state.sql     learner tables, SRS, storage bucket
  0003_rls.sql               functions, triggers, RLS, storage policies
  0004_import_functions.sql  idempotent content importer
  0005_seed_curriculum.sql   GENERATED — full seed
scripts/build-seed-sql.mjs   regenerates 0005 from the JSON
```

Regenerate the seed after editing content:

```bash
node supabase-b1-b2/scripts/build-seed-sql.mjs
```

Apply to a project (CLI, linked to `ebzmkhrssgnzmixfsuso`):

```bash
supabase link --project-ref ebzmkhrssgnzmixfsuso
supabase db push            # or: psql "$DATABASE_URL" -f migrations/0005_seed_curriculum.sql
```

Re-seeding is idempotent and does not delete learner data.

Generate TypeScript types for the app:

```bash
npx supabase gen types typescript --project-id ebzmkhrssgnzmixfsuso > types/b1b2-database.ts
```

---

## Environment variables

Local values are in `supabase-b1-b2/.env.local` (git-ignored). Committed example:
`.env.example`.

| Variable | Where it is used |
|---|---|
| `SUPABASE_B1B2_URL` | Browser + server client |
| `SUPABASE_B1B2_PUBLISHABLE_KEY` | Browser client |
| `SUPABASE_B1B2_SERVICE_ROLE_KEY` | Server-only admin/seeding — copy from the dashboard |
| `SUPABASE_B1B2_DB_URL` | Direct Postgres for Prisma/migrations (contains the DB password) |

The DB password was generated at creation. If it is ever exposed, reset it in
**Project Settings → Database** and update `SUPABASE_B1B2_DB_URL`.

---

## Not done yet

These are deliberate gaps, not oversights:

1. **Recorded audio for listening inputs.** The app reads transcripts aloud with
   the browser's speech synthesis (speed control, en-GB voice) and hides the text
   behind a "Show transcript" toggle, but there are no produced audio files yet.
   `content_inputs.duration_seconds` and `accent` are ready for them.
2. **Pronunciation scoring from the audio itself.** Pronunciation is currently
   inferred from the transcript by the examiner prompt; a phoneme-level model
   would need the audio features Whisper discards.
3. **Enrolment bootstrap.** `get_learner_dashboard()` reads `enrollments` for the
   next lesson; a new sign-up has no enrolment row, so the dashboard falls back
   to the curriculum outline. An onboarding insert closes that gap.

## Lesson-level output tasks (0008)

Every lesson now owns its output task. The migration derives a speaking task for
the 56 non-writing lessons and a writing task for the 8 writing lessons from
each lesson's authored output block (title, prompt, target seconds, word range),
inheriting the module's phrases, linkers and writing outline as scaffolding.

`get_lesson()` prefers `lesson_id` and falls back to the module-scoped task, so
results are now attributable per lesson. `get_due_cards(p_limit, p_deck_slug)`
accepts a deck filter, and `get_checkpoint(code)` plus
`complete_checkpoint(code, scores, quiz_correct, quiz_total, speaking_attempt_id,
writing_submission_id)` back the checkpoint screen (24-item mixed quiz, scored
recording and writing, band recorded in `checkpoint_attempts`, +150 XP).

Applied remotely as two migrations — `b1b2_per_lesson_tasks` and
`b1b2_checkpoint_runner` — mirrored locally in
`migrations/0008_per_lesson_tasks.sql`.

---

## App wiring (done)

The Next.js app reads this project directly; there is no build step and no
duplicated course data.

| App surface | Reads / writes |
|---|---|
| `/curriculum` | `get_curriculum_outline()` — modules, 64 lessons, per-skill completion, due cards, checkpoints |
| `/curriculum/lessons/:n` | `get_lesson(n)` — lesson, module, 5 blocks, practice items, input, speaking/writing task, progress |
| Warm-up block | `ensure_vocab_cards()` → `get_due_cards(8)` → `review_vocab_card(card, grade)` |
| Output block | `storage('speaking-recordings')` + `speaking_attempts`; `writing_submissions` |
| Feedback block | `POST /api/curriculum/progress` → `lesson_progress` (XP via `lesson_progress_reward`) |
| `/api/progress` | same table, addressed by lesson number |
| `POST /api/curriculum/score` | Groq examiner → `speaking_attempts` / `writing_submissions` scores, strengths, improvements |
| `/dashboard` | `get_learner_dashboard()`, `weekly_reports`, badges |
| `/review` | `get_due_cards(20)` across decks |
| `/curriculum/checkpoints/:code` | `get_checkpoint()` → `complete_checkpoint()` |

Aliases: `lib/b1b2/{types,data}.ts`, `components/b1b2/*`, `utils/supabase/server.ts`.
The repo's `@/*` path alias points at the repo **root**, not `src/`.

### Environment variables the app needs

Set these in `.env.local` and in Vercel (Preview + Production):

```
NEXT_PUBLIC_SUPABASE_URL=https://ebzmkhrssgnzmixfsuso.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=...        # Stripe webhook + admin paths only
```

Until the Vercel values change, deployments keep talking to the old project and
`/curriculum` will show its "Curriculum unavailable" state — `get_lesson` and
`get_curriculum_outline` do not exist there.

### Legacy URLs

Old 32-session links are permanent redirects, never 404s:

- `/curriculum/modules/:m/lessons/:l` → `/curriculum/lessons/(m−1)·8 + (l−1)·2 + 1`
- `/lessons/:sessionId` and `/sessions/:n` → `/curriculum/lessons/2n − 1`

Session `l` covered two new lessons (`2l−1` and `2l`), so the redirect lands on
the first of the pair.
