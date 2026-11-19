# Learning-state implementation

Apply `20261119000003_persistent_learning_state.sql` in the Supabase SQL editor after the CEFR curriculum and private audio migrations. This enables per-learner lesson progress, weekly pace preferences, and a due vocabulary review queue. Authenticated API routes enforce ownership through Supabase RLS.

Checkpoint writing submissions are evaluated at `/api/checkpoints/writing`; the curriculum progress route is `/api/curriculum/progress`. The Progress Passport can load past checkpoint attempts from `/api/checkpoints/portfolio`.
