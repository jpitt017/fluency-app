-- CEFR curriculum progress and Progress Passport storage.
-- Safe to run repeatedly.

create table if not exists public.cefr_objective_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  objective_id text not null,
  mastery numeric(5,2) not null default 0 check (mastery >= 0 and mastery <= 100),
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, objective_id)
);

create table if not exists public.cefr_checkpoint_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_number integer not null check (module_number between 1 and 8),
  objective_id text not null,
  transcript text,
  duration_seconds integer,
  wpm numeric(7,2),
  filler_frequency numeric(7,4),
  pause_duration_seconds numeric(7,2),
  target_structure_hit_rate numeric(5,2),
  rubric jsonb not null default '{}'::jsonb,
  passed boolean not null default false,
  review_deck jsonb not null default '[]'::jsonb,
  recording_url text,
  writing_sample text,
  created_at timestamptz not null default now()
);

alter table public.cefr_objective_progress enable row level security;
alter table public.cefr_checkpoint_attempts enable row level security;

create policy "Users can read their CEFR progress"
  on public.cefr_objective_progress for select
  using (auth.uid() = user_id);

create policy "Users can upsert their CEFR progress"
  on public.cefr_objective_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update their CEFR progress"
  on public.cefr_objective_progress for update
  using (auth.uid() = user_id);

create policy "Users can read their checkpoints"
  on public.cefr_checkpoint_attempts for select
  using (auth.uid() = user_id);

create policy "Users can create their checkpoints"
  on public.cefr_checkpoint_attempts for insert
  with check (auth.uid() = user_id);
