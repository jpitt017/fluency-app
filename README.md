# Fluency Studio — B1 British English Platform

An AI-powered British English learning platform focused on CEFR B1 speaking and writing fluency. Built with **Next.js 16 (App Router)**, **Supabase SSR**, **Groq (Whisper & LLM)**, and **Stripe**.

**Live Production App:** [https://fluency-app-nine.vercel.app](https://fluency-app-nine.vercel.app)

---

## Core Features

- **Speaking Lab (`/labs`):** Real-time audio recording transcribed via Groq Whisper and evaluated against B1 British English fluency, pronunciation, and vocabulary benchmarks.
- **Writing Lab (`/labs`):** Interactive writing practice with structured AI grammar corrections, natural British phrasing suggestions, and target keyword tracking.
- **Structured Curriculum (`/lessons`, `/sessions`):** Guided modules with progress tracking and placement onboarding (`/onboarding/placement`).
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