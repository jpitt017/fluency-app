# AI API usage guard

The shared request guard is enforced in `src/proxy.ts` for speaking, writing, checkpoint, and lesson-generation endpoints. Apply `20261119000004_ai_usage_guard.sql` to Supabase before enabling these routes. The database function atomically meters authenticated users, with a five-request rolling minute window and a weighted 60-unit rolling 24-hour allowance. Audio transcription and checkpoint/lesson generation consume more units than chat or text correction. The application fails closed if the quota RPC is unavailable.

The limits are application-level safeguards, not a billing estimate or a substitute for provider account limits. Tune the per-route unit weights and limits in the SQL migration after observing actual Groq usage.
