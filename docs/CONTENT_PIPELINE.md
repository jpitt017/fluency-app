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

Both documents are marked as pilot draft until a second teacher completes the
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
rows) and `syllabus_checkpoint_items`. Cut scores and thresholds are provisional
until the pilot calibrates them.

## 5. Render in the app

`lib/curriculum/syllabus.ts` imports the same JSON. `loadSyllabusContent()`
reads weeks and checkpoints from Supabase (public read policies) and falls back
to the bundled document when Supabase is not configured or unreachable. Routes:

- `/curriculum` — stage overview, week explorer, weekly rhythm, ladders, checkpoints and policies
- `/curriculum/weeks/[week]` — one week's grammar, targets, task list and checkpoint
- `/syllabus` — redirects to `/curriculum`
- `/assessments` — writing and speaking bands, placement rules, Checkpoint 1 speaking conditions and the filterable quiz bank

The legacy `english-b1-b2` course and its learner rows are deliberately left
untouched; the new routes read the `syllabus_*` tables instead.
