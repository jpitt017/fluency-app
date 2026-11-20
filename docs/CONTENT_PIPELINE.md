# Content Scaling Pipeline (Modules 2–8)

This repository enforces a repeatable 5-step pipeline for authoring, validating, recording, and releasing B1 → B2 curriculum modules.

## 1. Author from one strict template
- Canonical template: `supabase-b1-b2/content/curriculum/session-template.json`
- Generate a fresh module skeleton:
  ```bash
  node scripts/scaffold-module.mjs 2 --out /tmp/module-2.json
  ```
- Fixed slots per module:
  - **2 grammar areas**, each with `explanation`, `keyPoints`, `example`, and ≥ 3 answer-keyed `items`
  - **8–12 vocabulary collocations** (`example`, `collocations`, `translation`, `audioRef`)
  - **1+ listening input** (`body` transcript, `accent`, `speaker_accents`, `seconds`, `audioRef`, comprehension `questions`)
  - **1+ reading input** (`body`, comprehension `questions`)
  - **3 speaking tasks** (`prompt_card` / `monologue`, `role_play` / `interview`, `shadowing`)
  - **1 writing task** (`wordMin`–`wordMax`, 5-stage `outline`)
  - **8 lessons** tying into module checkpoints (`Modules 2, 4, 6, 8` in `course.json`)

## 2. Draft with an LLM, review as a human
- Validate every draft JSON immediately against `lib/b1b2/curriculum-schema.ts`:
  ```bash
  npm run validate:curriculum
  ```
- Before merging any module revision, review prose manually for:
  - Natural British English phrasing and cultural fit (outside explicitly American-accented scripts)
  - B1 accessibility in definitions and example sentences
  - Idiomatic collocations rather than literal translations

## 3. Automated CI content checks
`npm run validate:curriculum` runs on every PR in `.github/workflows/ci.yml` (`build-and-offline-evals`) and enforces:
- Strict Zod schema conformance across `course.json` and `modules-*.json`
- 100% of vocabulary items have `example`, `collocations`, and `audioRef`
- 100% of listening inputs have `body` (transcript), `accent`, `speaker_accents`, and `audioRef`
- 100% of grammar items and input questions have `answer` present in `options`
- Unedited `REPLACE:` markers and accidental US spellings in British prose fail CI

Rebuild SQL seeds after any JSON edit:
```bash
npm run db:b1b2:build-seed
```

## 4. Record accent tracks last
1. Finalise and human-review scripts first.
2. Generate TTS audio **for vocabulary items only**:
   ```bash
   node scripts/generate-course-audio.mjs --module 2 --vocab-only
   ```
3. Export voice-actor recording scripts for multi-accent listening tracks:
   ```bash
   node scripts/generate-course-audio.mjs --export-scripts > /tmp/recording-scripts.md
   ```
4. Once actors record the `.mp3` files (`<recordings-dir>/module-<N>/<slug>.mp3`), upload audio + generated WebVTT captions to `course-audio` / S3:
   ```bash
   node scripts/generate-course-audio.mjs --module 2 --upload-dir ./recordings
   ```

## 5. Ship module by module
- Mark modules in `modules-*.json` with `"releaseStage": "beta" | "live" | "draft"`.
- Release Module 2 to beta learners and inspect error ledger, completion drop-off, and speaking/writing scores before promoting Modules 3–8.
