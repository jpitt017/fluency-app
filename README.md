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

A test must never send an auth email. A fake address cannot receive mail, so
every message sent to one bounces, and a project that keeps bouncing mail is
flagged by Supabase and damages its sending domain. Admin creation with
`email_confirm: true` queues nothing; tests then sign in with a password, which
also sends nothing. Nothing under `tests/` or `scripts/` may call `signUp`,
`signInWithOtp`, `resetPasswordForEmail`, `inviteUserByEmail` or `resend` — only
the app's own `/login` page may, for real people. `tests/unit/no-auth-email.test.mjs`
enforces this in CI, for scripts and for `.github/workflows/`.

## Creating and managing pilot learners

While the project is a pilot without custom SMTP, **no auth email can be sent**:
Supabase's built-in mailer is limited to a couple of messages an hour and is not
for production use. Accounts are therefore created and recovered by hand through
the **admin API** (or the SQL editor, which reaches the same tables). Nothing
below sends mail.

### One switch for the email-based login options

The login page reflects this: the magic-link button and the "Forgot password?"
link are hidden behind one setting, `NEXT_PUBLIC_EMAIL_LINKS_ENABLED`. It is **off unless set to exactly `true`**, so
a pilot deployment never offers a control that can only fail. While it is off,
learners see "Forgot your password? Message your teacher." Turn both buttons back
on only after custom SMTP is configured and the templates in
[`docs/AUTH_EMAIL_TEMPLATES.md`](docs/AUTH_EMAIL_TEMPLATES.md) are pasted.

### Create a pilot learner

Prerequisites: the production service-role key and project URL. The address must
be one the learner actually owns; a temporary password is handed over out of band
and changed on first sign-in.

```bash
export SUPABASE_URL="https://ebzmkhrssgnzmixfsuso.supabase.co"
export SERVICE_ROLE_KEY="…"   # Supabase → Settings → API → service_role
export LEARNER_EMAIL="learner@example.com"
export TEMP_PASSWORD="Pilot-$(openssl rand -hex 6)"
```

1. **Create the user, confirmed, so no email is queued:**

```bash
curl -sS -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$LEARNER_EMAIL\",\"password\":\"$TEMP_PASSWORD\",\"email_confirm\":true}" \
  | jq '{id, email, email_confirmed_at, confirmation_sent_at}'
```

`email_confirm: true` is the whole point: the account is usable immediately and
`confirmation_sent_at` stays **null**. The `on_auth_user_created` trigger inserts
the `profiles`, `skill_levels` and `enrollments` rows automatically.

2. **Confirm the role and grant the pilot tier.** The role must be `learner`, or
`teacher_set_pilot` refuses it. Pilot membership is a row in `pilot_learners`,
not a column:

```sql
-- Replace the address.
with learner as (
  select id from public.profiles where email = 'learner@example.com' and role = 'learner'
)
insert into public.pilot_learners (user_id, assigned_by)
select l.id, (select id from public.profiles where role = 'admin' order by created_at limit 1)
from learner l
on conflict (user_id) do nothing;
```

3. **Verify what the learner will actually get.** This calls the same function the
app calls:

```sql
-- profiles has the app-side fields; auth.users has the auth-side ones
-- (email_confirmed_at, confirmation_sent_at). Join both.
select p.email, p.role, (pl.user_id is not null) as is_pilot,
       u.email_confirmed_at, u.confirmation_sent_at
from public.profiles p
left join public.pilot_learners pl on pl.user_id = p.id
left join auth.users u on u.id = p.id
where p.email = 'learner@example.com';
-- email_confirmed_at set and confirmation_sent_at null == no email was sent.
-- Tier comes from get_ai_usage_status(): pilot = 120 units/day, 12 requests/minute.
```

Then hand over the address and `$TEMP_PASSWORD`, and ask them to change it at
**/login?mode=update-password** on first sign-in.

### Reset a learner's password

There is no self-service reset without SMTP, so set a new temporary password
through the admin API. Nothing is emailed; give the new password to the learner
directly.

```bash
USER_ID=$(curl -sS "$SUPABASE_URL/auth/v1/admin/users?page=1&per_page=200" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  | jq -r '.users[] | select(.email=="'"$LEARNER_EMAIL"'") | .id')

curl -sS -X PUT "$SUPABASE_URL/auth/v1/admin/users/$USER_ID" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$TEMP_PASSWORD\"}"
```

The learner's data, band, streak and pilot membership are untouched. Ask them to
set their own password at **/login?mode=update-password** — that form uses
`updateUser`, which needs the session they already have and sends no email.

### When email is available again

1. Configure custom SMTP for a domain you control.
2. Paste the five templates from
   [`docs/AUTH_EMAIL_TEMPLATES.md`](docs/AUTH_EMAIL_TEMPLATES.md).
3. Set `NEXT_PUBLIC_EMAIL_LINKS_ENABLED=true` and redeploy: the magic link and
   "Forgot password?" come back, and "Message your teacher" disappears.
4. Run the three-flow check in that doc (admin `generate_link`, no email sent).

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
the weeks in the course pace (speed 0.8 — 0.75 for Joanne and Tom, whose voices
read fast — with 0.3 s between sentences, 0.7 s between speakers and 0.8 s
between paragraphs) with each speaker's own voice settings, and attaches the
requested clips as the `voice-check` artifact (three days). Every clip reports its words per minute, so the pace can
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
