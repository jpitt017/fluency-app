# Syllabus content pipeline

The two-stage B1 → B2 syllabus is authored once and shipped to two places: the
Next.js curriculum routes and Supabase. The single source of truth is
[`supabase-b1-b2/content/curriculum/two-stage-syllabus.json`](../supabase-b1-b2/content/curriculum/two-stage-syllabus.json),
transcribed from the November 2026 course syllabus PDF.

## 1. Edit the JSON

The document holds:

- `course` and `placement` — audience, pace, 24-question placement test and outcomes
- `stages` — two 16-week / 52-hour stages with their phase descriptions
- `weeks` — all 32 themes, main grammar, light/recycled grammar and skills focus
- `weeklyTasks` — the nine-row weekly task template with requirement levels
- `skillLadders` — listening, reading, extra input, speaking, AI conversation and writing targets per phase
- `checkpoints` / `externalAssessments` — eight four-week checkpoints plus EF SET tests
- `progression`, `principles`, `adaptation`, `nextSteps`, `aiAndData`, `teachers` — the course policies

Keep week numbering global (1–32), checkpoint weeks at multiples of four, and
the stage-1/stage-2 boundary at week 17.

## 2. Validate

```bash
npm run validate:syllabus
```

The validator checks stage/week counts, unique week numbers, phase membership,
checkpoint mapping, skill-ladder coverage and required task fields. Add it to
CI whenever curriculum content is edited.

## 3. Regenerate the Supabase migration

```bash
npm run build:syllabus-seed
```

This rewrites `supabase-b1-b2/migrations/0019_two_stage_syllabus.sql`. The
migration is idempotent: it stores the full document in `syllabus_course`,
expands it into `syllabus_stages`, `syllabus_weeks`, `syllabus_checkpoints`,
`syllabus_skill_ladders` and `syllabus_weekly_tasks`, and mirrors the stage/week
structure into the core `courses`, `modules` and `checkpoints` tables. Re-running
it never deletes learner rows.

Apply it to a project with the Supabase migration tool or `psql`:

```bash
supabase link --project-ref ebzmkhrssgnzmixfsuso
supabase db push
```

## 4. Author Weeks 1–4 detail and assessments

Two more JSON documents sit alongside the syllabus:

- `weeks-01-04-details.json` — grammar notes, the full 120-item bank (30 per
  week with keys, separate accepted variants and reasons), notice texts and the
  nine-step 20-minute task, speaking content (cue cards, phrase banks, model
  answers, three shadowing chunks, four-turn conversation plans with follow-up
  questions, delayed recall and B2 stretch), writing tasks,
  core/collocation/family vocabulary, linkers and checkpoint focus for Weeks 1–4
- `assessments.json` — writing descriptors, speaking descriptors using the same
  four criteria, the 24-question placement blueprint, and the 20 + 4 reserve-item
  Checkpoint 1 question bank plus its writing and speaking conditions

All pilot documents are marked as draft until a second teacher completes the
review checklist. The item bank keeps the IDs from the source document (for
example `W1-L3`, `W1-C5`, `W4-G5`) and stores accepted variants in their own
`accepted` list; two-gap items store one key and one variants list per gap.

Validate and regenerate their migration after edits:

```bash
npm run validate:details
npm run build:details-seed
```

This writes `supabase-b1-b2/migrations/0020_weeks_1_4_and_assessments.sql`,
which seeds `syllabus_week_details`, `syllabus_assessments` (now including
`speaking-descriptors`), `syllabus_vocab_items`, `syllabus_grammar_items` (120
rows), `syllabus_input_items` (80 listening/reading questions) and
`syllabus_checkpoint_items`. Cut scores and thresholds are provisional
until the pilot calibrates them.

### 4.1 Answer isolation

Migration `0021_lock_answer_tables.sql` drops public read from answer-bearing
tables and grants `select` only to authenticated teachers/admins via
`is_staff()`. Learner-facing code reads `*_safe` views, which strip `key`,
`accepted`, `reason`, `model`, `modelAnswer` and `answer_index` recursively.
Placement answers are checked server-side with `SUPABASE_SERVICE_ROLE_KEY`;
`npm run test:rls` verifies both the lock and the safe views.

## 5. Render in the app

`lib/curriculum/syllabus.ts` imports the same JSON. `loadSyllabusContent()`
reads weeks and checkpoints from Supabase (public read policies) and falls back
to the bundled document when Supabase is not configured or unreachable. Routes:

- `/curriculum` — stage overview, week explorer, weekly rhythm, ladders, checkpoints and policies
- `/curriculum/weeks/[week]` — one week's grammar bank, speaking, listening script, reading text, full writing task, targets and checkpoint
- `/syllabus` — redirects to `/curriculum`
- `/assessments` — writing and speaking bands, placement rules, Checkpoint 1 speaking conditions and the filterable quiz bank

The legacy `english-b1-b2` course and its learner rows are deliberately left
untouched; the new routes read the `syllabus_*` tables instead.

## 6. Weeks 1–4 listening audio (AI trial recordings)

The four listening scripts in `weeks-01-04-details.json` need recordings. Real
voice actors are the plan; until those exist, a synthetic **AI trial recording**
can stand in, clearly labelled and easy to take back down.

> **Current status (22 November 2026):** the first trial used OpenAI's voices
> and sounded American rather than British, so it will not be used. All four
> weeks are unreleased, the generated MP3/WebVTT files have been deleted from the
> public `course-audio` bucket, and `/week/[n]` shows "Audio coming soon." The
> pipeline now uses ElevenLabs custom British and Irish voices; every unapproved
> file lives in the private `course-audio-review` bucket (migration 0039) and is
> only copied to the public bucket on approval.

### The approval switch

Migration `0038_listening_audio_trials.sql` adds one row per week to
`public.listening_audio_trials`:

| column | meaning |
| --- | --- |
| `week` | 1–4 |
| `audio_url` | the live MP3 URL in `course-audio`. **Empty until a person approves the track.** |
| `captions_url` | the public WebVTT URL, set on release; not shown yet |
| `source` | `ai-trial` until a voice-actor recording replaces it |
| `released` | `false` = learners see "Audio coming soon." |
| `model`, `voices`, `duration_seconds`, `caption_cues`, `generated_at`, `released_at` | audit trail |

`/week/[n]` reads this table server-side. `resolveTrialAudio()` in
`lib/curriculum/listening-audio.ts` fails closed: no row, `released = false`,
a source other than `ai-trial`, or an empty `audio_url` all leave the page on
"Audio coming soon." Every row is created unreleased, so merging this code plays
nothing.

### Approval rules

**A week is never marked `released` on production, not even briefly for a test.**
`released = true` is exactly the switch that makes a real learner hear a track
and that changes `/week/[n]` from "Audio coming soon."; the page is live, so
there is no safe window between "flip the flag, check the behaviour, flip it
back". A test that needs the flag set must run somewhere the flag cannot reach a
learner:

| instead of production                                      | what it gives you                                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **unit tests** with a fake Supabase client                 | `resolveTrialAudio()`, `releaseTrial()`, `assertNotReleased()` and the delete guards, with no project involved. This is the default and covers almost everything. |
| **a preview / branch database**                            | a real `listening_audio_trials` table to release against, with the pipeline pointed at that URL                                                                   |
| **a fake week number learners cannot open** (e.g. week 31) | the row really becomes `released = true`, but no page path can show it: only Weeks 1–4 are scheduled, and `resolveTrialAudio()` fails closed for anything else    |

Verifying a _guard_ — "does delete refuse a released week?" — never needs a
production release at all: pass the guard a row that says `released: true` and
assert it refuses. If a behaviour can only be shown by writing to production,
it is not tested enough yet.

The scripts enforce the same rule from their side: `--release` and `--revoke`
call `checkApprovalTarget()` from
`scripts/lib/course-audio/environment.mjs` and refuse to run when
`NEXT_PUBLIC_SUPABASE_URL` points at the production project
(`ebzmkhrssgnzmixfsuso`), or at anything unrecognisable. The only escape hatch is
an explicit `ALLOW_PRODUCTION_RELEASE=1`, which belongs to a deliberate,
human-reviewed release and nothing else. The workflow asks for two things before
it will set that: the `allow_production_release` checkbox **and** typing
`release to learners` into `production_ack`. A single stray tick is not enough.

Writes that do _not_ touch the flag stay safe to rehearse against production:
generating, uploading unreleased, `mode: review`, `mode: list` and
`mode: delete` all leave learners on "Audio coming soon."

### Generating the tracks

Run the manual **Course audio — AI trial tracks** workflow
(`.github/workflows/course-audio.yml`, `workflow_dispatch`). It needs the
`ELEVENLABS_API_KEY` repository secret plus the Supabase URL and service-role
key, and installs ffmpeg for MP3 encoding.

**Step 1 — approve the voices (`mode: voice-check`).** This records the clips a
review asks for by name, at the course pace and with each speaker's own voice
settings: one MP3 per request, each line verbatim. The current set is Tom's first
two Week 2 lines, Marta's three longest Week 3 turns and Ellie's longest Week 1
answer — the two replaced voices plus an unchanged one, so a single listen covers
both the new voices and the new pauses. The clips go to the private review
bucket and are attached to the run as the **`voice-check` artifact** (kept for
three days). Every clip reports its words per minute,
measured from the assembled timeline — words spoken over the wall-clock length,
pauses included — so the pace is a number, not an impression. Download the
artifact to listen. Short clips do not use up a normal monthly quota cycle the
way four full tracks would, and a voice that needs replacing is replaced before
any track depends on it.

**Step 2 — generate the tracks (`mode: generate`).** Runs
`scripts/generate-course-audio.mjs --weeks 1,2,3,4`, which:

1. parses each authored script into speaker turns;
2. speaks every *sentence* with that speaker's own ElevenLabs voice — Host =
   southern English, Ellie = Scottish, Aisha = London, Tom = northern English,
   Dan = Welsh, Marta = West Midlands, Joanne = Yorkshire. The accent comes from
   the voice itself: no instruction or prompt tries to change it. Voice settings
   are per speaker: everyone uses `VOICE_SETTINGS`, and a character may carry a
   `settings` override — Tom 0.3 / 0.4 (enthusiastic about his course), Aisha
   0.35 / 0.3 (happy for him), Dan 0.38 / 0.25 and Marta 0.3 / 0.4 (flatmates who
   get on well), Joanne 0.35 / 0.35 (a guide who loves York). The Host and Ellie
   keep 0.45 / 0. Unless a speaker is named, the defaults apply. A character may
   also override the pace's **speed** on their own: Joanne and Tom read at 0.75,
   because those voices come out measurably fast — Joanne's Week 4 passed the
   140–150 wpm target at 0.8, and Tom's replacement voice (Jack C) is fast paced.
   Nobody else's rate moves; Marta's replacement (Katie) is a Midlands voice that
   needs the slower delivery, not a slower tempo, so she keeps 0.8;
3. holds the course pace (`PACE_PROFILES.b1`, the default for all four weeks):
   `speed: 0.8` (0.75 for Joanne and Tom, see above), aiming at roughly 140–150
   words a minute, with a 0.3 s gap between sentences inside a line, 0.7 s
   between two speakers and 0.8 s between paragraphs. A line is split into sentences (never on "Mr." or on a
   number), and each cue is one sentence;
4. encodes one MP3 and one WebVTT file per track, with one caption cue per
   sentence timed to the audio;
5. uploads both to the **private** `course-audio-review` bucket under
   `weeks-01-04/ai-trial/` and writes the row **unreleased** with
   `source: "ai-trial"` and no `audio_url`;
6. attaches the week's MP3 and WebVTT files to the run as the **`review`
   artifact** (three days), so a week can be listened to — with captions — before
   anyone approves it.

Nothing here sets the live `audioUrl`. Nothing here releases a track.

### Listening before approval

**Signed links.** One-hour, single-purpose URLs into the private bucket. They are
printed to the step log only in `mode: review`, whose whole job is handing out a
link for a track that already exists; `generate` and `voice-check` never print
one. They are never written into the step summary, because GitHub redacts the
token when it renders the page — a link in a summary is unusable, and a link in a
log is a link in a screenshot.

**Artifacts.** `mode: generate` attaches `review` (MP3 + WebVTT per week),
`mode: voice-check` attaches `voice-check` (the requested lines), and
`mode: voice-sample` attaches `week-sample`. All are kept for three days and are
the supported way to listen, including on a phone.

**Changing a voice before re-recording.** `mode: voice-sample` takes exactly one
week. It speaks each of that week's speakers on their three longest lines —
verbatim, in script order, one MP3 per speaker — with that week's voice settings
and the chosen `pace` input (`b1`, the course pace, by default). The clips land
in the private review bucket as `weeks-01-04/ai-trial/week-N-sample-<Speaker>.mp3`,
are attached as the `week-sample` artifact, and touch neither the week's track
nor its approval row. The listening script is never edited to make a sample.

### Speech model

The voices are ElevenLabs custom voices chosen for the seven regional accents;
`SPEAKER_VOICES` in `scripts/lib/course-audio/tts.mjs` pins their IDs, and each
entry also records the voice's display name and accent for reviewers. The model
is `eleven_multilingual_v2`, called as one plain HTTP request per line:

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=pcm_24000
xi-api-key: <ELEVENLABS_API_KEY>
{ "text", "model_id", "voice_settings": { stability, similarity_boost, style, speed } }
```

Raw 24 kHz PCM comes back, which keeps the per-line boundaries the captions need
and lets the existing PCM → WAV → `loudnorm` MP3 steps run unchanged.
`eleven_multilingual_v2` is used because it honours `speed`; `eleven_v3` is more
expressive but ignores `speed` and adds its own pauses, which is wrong for graded
listening material. The 44.1 kHz output format is a paid-tier feature, so 24 kHz
is requested.

429 and 5xx responses are retried with exponential backoff; a 4xx response is a
configuration error (bad key, unknown voice, gated format) and fails immediately
with the API's message in the workflow log.

The first trial used OpenAI `gpt-realtime-2.1-mini`, which produced
American-sounding speech even with an explicit regional accent instruction. Those
files were deleted and OpenAI was removed from the audio pipeline entirely; the
app's other AI features use Groq and are unaffected.

Voices must be unique within a track; `assertDistinctVoices()` fails the run
otherwise, because learners rely on the voices to tell speakers apart.

### Reviewing and approving

1. Listen to the `review` artifact from the generate run, or run `mode: review`,
   `weeks: "1"` for a signed listening link valid for **one hour** (plus the
   state: unreleased). The review bucket is private, so those are the only ways
   in.
2. Listen against the script, using the production checklist in
   `weeks-01-04-details.json`.
3. `mode: release`, `weeks: "1"` copies the reviewed MP3 and WebVTT from
   `course-audio-review` into the public `course-audio` bucket and sets
   `audio_url` + `released = true`. That is the only code path that makes a track
   playable. The page then shows the player labelled **AI voice – trial
   recording**, with the speakers' accents and a note that the real voices will
   replace it. The track plays twice (first listen for the gist task, second for
   detail) with the transcript hidden.
4. `mode: revoke` un-approves a track: the public URLs are cleared, the public
   copy is removed from `course-audio`, and learners go back to "Audio coming
   soon." The private review copy is kept, so `mode: release` can put it back
   without re-recording.
5. `mode: delete` deletes a week's MP3 and WebVTT from **both** buckets and
   clears the URLs on the row. The row itself stays, unreleased, so the week
   keeps saying "Audio coming soon." Deletion goes through the Storage API
   (Supabase blocks direct deletes on `storage.objects`) and the command
   re-lists the folder afterwards to confirm the files are gone.

   `mode: delete` is guarded in three ways:

   - **Only trial paths.** It refuses any bucket other than
     `course-audio-review` / `course-audio`, and any key that is not exactly
     `weeks-01-04/ai-trial/week-N-listening.mp3` or `…vtt` for Weeks 1–4, so a
     `..` segment, an absolute path, a nested or empty segment, an encoded
     traversal (`%2e`, `%2f`) or any other file name is rejected before the
     Storage API is called. Only Weeks 1–4 have trial tracks, so any other week
     number is an error as well.
   - **Dry run unless confirmed.** Without `confirm: true` (workflow input
     `confirm`, CLI `--confirm`) the command prints what it _would_ delete and
     exits successfully without removing or updating anything.
   - **Never a released week.** A week with `released = true` is reported as
     `BLOCKED - released for learners`, and a confirmed batch containing any
     released week is refused as a whole. Run `mode: revoke` first.

Review links are 1-hour signed URLs on a private bucket with no storage
policies, so an unapproved recording cannot be reached by guessing a path even
if a link leaks.

### Marking

Listening answers are saved but **not marked** yet: `WeekInputTask` records
completion so a week can open, and the answer key stays in the locked
`syllabus_input_items` table. Marking arrives with reading.
