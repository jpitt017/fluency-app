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
- **Structured Curriculum (`/curriculum`):** the full 32-week, two-stage syllabus with a filterable week explorer, per-week grammar/skill targets, a nine-task weekly rhythm, six skill ladders, eight checkpoints, EF SET tests and placement onboarding (`/onboarding/placement`). Individual weeks live at `/curriculum/weeks/[week]` (Weeks 1–4 include grammar notes, model answers, vocabulary and conversation scenarios); `/syllabus` redirects to the overview.
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