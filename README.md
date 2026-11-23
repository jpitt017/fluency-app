# Fluency Studio — B1 British English Platform

An AI-powered British English learning platform focused on CEFR B1 speaking and writing fluency. Built with **Next.js 16 (App Router)**, **Supabase SSR**, **Groq (Whisper & LLM)**, and **Stripe**.

**Live Production App:** [https://fluency-app-nine.vercel.app](https://fluency-app-nine.vercel.app)

> **Course data source (November 2026):** the app follows the two-stage
> *Fluency Studio: B1 to B2 English Course* syllabus — 32 weeks in two 16-week
> stages (~104 hours), with one weekly speaking task, writing task and
> listening/reading task required for progression, plus eight four-week
> checkpoints. The authored document is
> [`two-stage-syllabus.json`](supabase-b1-b2/content/curriculum/two-stage-syllabus.json);
> the app reads week/checkpoint rows from the Supabase project
> (`ebzmkhrssgnzmixfsuso`, eu-west-1) with a bundled fallback, and mirrors the
> structure into `courses` / `modules` / `checkpoints`. See
> [`docs/CONTENT_PIPELINE.md`](docs/CONTENT_PIPELINE.md) and
> [`supabase-b1-b2/README.md`](supabase-b1-b2/README.md).

---

## Core Features

- **Speaking Lab (`/labs`):** Real-time audio recording transcribed via Groq Whisper and evaluated against B1 British English fluency, pronunciation, and vocabulary benchmarks.
- **Writing Lab (`/labs`):** Interactive writing practice with structured AI grammar corrections, natural British phrasing suggestions, and target keyword tracking.
- **Structured Curriculum (`/curriculum`):** the full 32-week, two-stage syllabus with a filterable week explorer, per-week grammar/skill targets, a nine-task weekly rhythm, six skill ladders, eight checkpoints, EF SET tests and placement onboarding (`/onboarding/placement`). Individual weeks live at `/curriculum/weeks/[week]` (Weeks 1–4 include the full 120-item grammar bank, speaking cue cards and conversation plans, listening scripts, reading texts and full writing tasks with model answers, plus 80 comprehension questions and vocabulary); `/syllabus` redirects to the overview.
- **Assessment Specs (`/assessments`):** writing band descriptors, the 24-question placement blueprint and decision rules, and the full Checkpoint 1 question bank with reserves.
- **Authentication & Persistence:** Server-side session management and user progress storage powered by Supabase SSR.
- **Subscription Billing:** End-to-end Stripe Checkout integration with idempotent webhook handlers (`/api/stripe/webhook`) and sliding-window API rate limits.

---

## Tech Stack

- **Framework:** Next.js 16 (`src/` App Router, `src/proxy.ts` edge routing)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Database & Auth:** Supabase (`@supabase/ssr`)
- **AI Inference:** Groq SDK (Whisper speech-to-text + LLM structured JSON feedback)
- **Payments:** Stripe Subscriptions & Webhooks
- **Hosting & CI/CD:** Vercel (auto-deploys from `main`)

### Deployments: docs, tests and content-review pushes do not build

`vercel.json` sets `ignoreCommand` to [`scripts/vercel-ignore-build.sh`](scripts/vercel-ignore-build.sh),
so Vercel skips a deployment when a push changes nothing the site is built from.

**Skipped** (exit 0 — no deployment):

- `docs/`, `tests/` and anything at the repo root ending in `.md`
  (`README.md`, `AGENTS.md`)
- `.github/` — CI configuration
- `supabase-b1-b2/scripts/` and `supabase-b1-b2/migrations/` and the
  `supabase-b1-b2/README.md` — content-review and database bookkeeping

**Always builds** (exit 1):

- `supabase-b1-b2/content/**`. This looks like content, but
  `lib/curriculum/*.ts` **imports** the JSON at build time, so editing it changes
  the shipped bundle. This is the entry most likely to be added to a skip list by
  mistake; `tests/unit/vercel-ignore-build.test.mjs` pins it.
- `src/`, `components/`, `lib/`, `public/`, `scripts/`, and every config file
  (`package.json`, the lockfile, `next.config.ts`, `vercel.json`, …).
- Anything unrecognised, including a newly added top-level directory. The list
  is a *skip* list on purpose: a missing entry costs one extra build, whereas an
  allow-list that misses a path ships stale code with nothing red to notice.

The comparison is against `VERCEL_GIT_PREVIOUS_SHA` (the last successful
deployment for the branch), never `HEAD^`, so a docs commit stacked on top of a
real change still deploys. Every uncertain case builds: the branch's first
deployment, a base commit outside Vercel's shallow clone, or a git error.

Two things worth knowing:

- A skipped build still **counts against the plan's deployment quota** — Vercel
  counts canceled builds too. The step saves build minutes, not deployments.
- `ignoreCommand` in `vercel.json` overrides the dashboard's *Ignored Build Step*,
  so nothing needs configuring by hand. To force a build that was skipped
  (e.g. after changing an environment variable): **Deployments → … → Redeploy**
  and untick *Use project's Ignore Build Step*.

Run the tests after editing the script or the list:
`node --test tests/unit/vercel-ignore-build.test.mjs`

---

## Local Development Setup

### 1. Clone & Install
```bash
git clone [https://github.com/jpitt017/fluency-app.git](https://github.com/jpitt017/fluency-app.git)
cd fluency-app
npm install
```

---

## Production migration history: placement v2

The live Supabase project `ebzmkhrssgnzmixfsuso` records two placement-v2
entries: `20261122093305_placement_questions_v2` and the additional
`20261122093801_placement_questions_v2_correct_copy`. The first live apply
inadvertently changed punctuation in the prompts for P02, P09 and P15; the
second entry records the correction to match the supplied v2 bank. This extra
entry is specific to the live migration history: repository migration
[`0028_placement_questions_v2.sql`](supabase-b1-b2/migrations/0028_placement_questions_v2.sql)
contains the correct prompts from the outset, so a fresh installation does not
need a separate correction.

A read-only comparison against an isolated fresh run of repository migrations
0027 and 0028 found matching counts and content digests for all 24 v2 questions
and both reading texts. The comparison covers the seeded question fields,
including answer indices and reasons, and all text fields; generated row IDs and
creation timestamps are not compared.

---

## Production test users

Any smoke test against the live production project must create a throwaway
learner through the Supabase **admin API** with an `@example.test` address and
`email_confirm: true` (no confirmation email). Use
`scripts/lib/test-user.mjs#createTestUser` and always call `deleteTestUser` in a
`finally` block so the user and every linked learning-data row are removed.
Never reuse a personal or long-lived account for production tests.

### Pilot navigation

Pricing links are hidden by default. Set `NEXT_PUBLIC_PILOT_PRICING_ENABLED=true` at build time to show them. The direct pricing page remains available for existing subscribers. Signed-in learners use their server-calculated current week across devices. Signed-out visitors use the last week opened in this browser, defaulting to Week 1.

### Weeks 1–4 listening audio

The four Week 1–4 listening tracks will be computer-generated stand-ins until the
voice-actor recordings exist. **None is live yet:** `/week/1`–`/week/4` show
"Audio coming soon." Tracks are generated with **ElevenLabs** custom British and
Irish voices and land **unreleased** in the private `course-audio-review` bucket
(`source: "ai-trial"`, no live `audioUrl`); approving one copies it to the public
`course-audio` bucket and sets `audio_url` on its `listening_audio_trials` row.
The manual `Course audio — AI trial tracks` workflow needs an `ELEVENLABS_API_KEY`
repository secret. Start with `mode: voice-check`, which reads real lines from
the weeks in the course pace (speed 0.8 — 0.75 for Joanne, who reads fast —
with 0.5 s between sentences, 0.7 s between speakers and 1.0 s between
paragraphs) with each speaker's own voice settings, and
attaches one clip per speaker plus the named step clips as the `voice-check`
artifact (three days). Every clip reports its words per minute, so the pace can
be checked before a whole track is recorded. `mode: generate` then attaches each
week's MP3 and captions as the `review` artifact; nothing is released until a
week is released on purpose. `mode: voice-sample` re-auditions one week on each
speaker's three longest lines, attached as the `week-sample` artifact, so a
change of voice settings can be heard before a whole track is re-recorded. A week only shows the player, labelled **AI voice – trial
recording**, once its row is released; see
[`docs/CONTENT_PIPELINE.md`](docs/CONTENT_PIPELINE.md) section 6.

### Issue reporting

Reports require authentication, the Supabase service role key and migration 0032. Audio is recorded as a maximum 60-second WAV, sent to the existing speech provider using the same transcription helper, and does not consume study units. A separate five-per-hour limit applies to report attempts. Screenshots are selected manually; people should remove private information first. URL query strings are omitted. Only the latest saved writing or speaking transcript is included when explicitly selected.

Broken-issue alerts use Resend. Configure `RESEND_API_KEY`, `ISSUE_EMAIL_FROM` (a verified Resend sender), `ISSUE_ADMIN_EMAIL`, and `ISSUE_APP_URL` in the deployment environment. Never put their values in Git. Unsent alerts remain pending and the existing daily retention cron retries them. Resend receives only a generic notification and the link, not the report content. The cron requires `CRON_SECRET`.

To run a single production issue-alert smoke test, manually dispatch the CI workflow with `production_issue_test` enabled. It creates a confirmed `@example.test` user, sends one broken report, checks the saved email status and removes the user and test data. A sent status means Resend accepted the message, not that inbox delivery was verified.

To verify production AI feedback, manually dispatch CI with `production_ai_test` enabled. The test creates a confirmed `@example.test` user through the admin API, signs in via the real login page, submits writing and recorded speech in Labs using real AI services, checks feedback, and deletes the test user and data. It requires the production Supabase URL and service-role key as GitHub Actions secrets and incurs normal AI usage; it does not run on ordinary CI pushes or pull requests.

AI practice limits reset at midnight Europe/Madrid. Free learners receive 30 units per day, pilot learners 120, Pro subscribers 180, and teachers/admins 1,000. Staff can turn pilot access on or off for learners in the Teacher Console. Active Pro subscriptions take priority over pilot access; staff limits take priority over both. Short per-minute limits still apply. Usage events remain logged, including for staff, and a manual daily reset does not delete usage history.
