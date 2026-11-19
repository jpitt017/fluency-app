# CEFR curriculum

The generated B1 course data lives in `content/curriculum/b1-64h.json`. Regenerate it with:

```bash
node scripts/generate-b1-curriculum.mjs
```

Apply the two Supabase migrations in `Supabase/migrations/` to enable objective progress, checkpoint attempts, and private checkpoint audio storage. Checkpoint audio is transcribed with the configured Groq Whisper model and assessed with the Groq chat model. Recording upload requires an authenticated Supabase user and the `checkpoint-recordings` private bucket configured by the migration.

The curriculum UI is available at `/curriculum`; lesson routes use `/curriculum/modules/{module}/lessons/{lesson}`. Checkpoints support direct audio recording in a modern browser or transcript submission as a fallback.
