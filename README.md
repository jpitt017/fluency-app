# Fluency Studio — B1 British English Platform

An AI-powered British English learning platform focused on CEFR B1 speaking and writing fluency. Built with **Next.js 16 (App Router)**, **Supabase SSR**, **Groq (Whisper & LLM)**, and **Stripe**.

**Live Production App:** [https://fluency-app-nine.vercel.app](https://fluency-app-nine.vercel.app)

> **Course data source (November 2026):** the app now reads its curriculum from
> the project in `supabase-b1-b2/` (`ebzmkhrssgnzmixfsuso`, eu-west-1): the
> 64-hour *English B1 → B2* course — 8 modules × 8 lessons × 5 blocks, 640
> practice items, spaced repetition, XP/skill meters and 4 checkpoints, all
> under RLS. The static 32-session course in `lib/curriculum.ts` is retired as a
> content source; its URLs redirect. See
> [`supabase-b1-b2/README.md`](supabase-b1-b2/README.md).

---

## Core Features

- **Speaking Lab (`/labs`):** Real-time audio recording transcribed via Groq Whisper and evaluated against B1 British English fluency, pronunciation, and vocabulary benchmarks.
- **Writing Lab (`/labs`):** Interactive writing practice with structured AI grammar corrections, natural British phrasing suggestions, and target keyword tracking.
- **Structured Curriculum (`/curriculum`):** 64 ten-to-fifteen-minute lessons over 8 modules, each with a warm-up, input, practice, output and feedback block, plus four assessment checkpoints and placement onboarding (`/onboarding/placement`). Legacy `/curriculum/modules/:m/lessons/:l`, `/lessons/:sessionId` and `/sessions/:id` URLs 308-redirect to the matching lesson.
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