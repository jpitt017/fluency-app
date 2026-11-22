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

### Issue reporting

Reports require authentication, the Supabase service role key and migration 0032. Audio is recorded as a maximum 60-second WAV, sent to the existing speech provider using the same transcription helper, and does not consume study units. A separate five-per-hour limit applies to report attempts. Screenshots are selected manually; people should remove private information first. URL query strings are omitted. Only the latest saved writing or speaking transcript is included when explicitly selected.

Broken-issue alerts use Resend. Configure `RESEND_API_KEY`, `ISSUE_EMAIL_FROM` (a verified Resend sender), `ISSUE_ADMIN_EMAIL`, and `ISSUE_APP_URL` in the deployment environment. Never put their values in Git. Unsent alerts remain pending and the existing daily retention cron retries them. Resend receives only a generic notification and the link, not the report content. The cron requires `CRON_SECRET`.

To run a single production issue-alert smoke test, manually dispatch the CI workflow with `production_issue_test` enabled. It creates a confirmed `@example.test` user, sends one broken report, checks the saved email status and removes the user and test data. A sent status means Resend accepted the message, not that inbox delivery was verified.
