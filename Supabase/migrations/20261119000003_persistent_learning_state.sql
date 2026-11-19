-- Persistent lesson state, learner pace settings, and lightweight spaced repetition.
create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_number integer not null check (module_number between 1 and 8),
  lesson_number integer not null check (lesson_number between 1 and 32),
  status text not null default 'in_progress' check (status in ('locked', 'in_progress', 'completed')),
  score numeric(5,2) check (score is null or (score >= 0 and score <= 100)),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_number, lesson_number)
);

create table if not exists public.curriculum_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_hours_per_week numeric(4,1) not null default 4 check (target_hours_per_week in (2, 4, 8)),
  updated_at timestamptz not null default now()
);

create table if not exists public.vocabulary_review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_number integer not null check (module_number between 1 and 8),
  objective_id text,
  prompt text not null,
  answer text not null,
  due_at timestamptz not null default now(),
  interval_days integer not null default 1 check (interval_days > 0),
  repetitions integer not null default 0 check (repetitions >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists vocabulary_review_due_idx on public.vocabulary_review_items (user_id, due_at) where completed_at is null;

alter table public.lesson_progress enable row level security;
alter table public.curriculum_preferences enable row level security;
alter table public.vocabulary_review_items enable row level security;

drop policy if exists "Users manage their lesson progress" on public.lesson_progress;
create policy "Users manage their lesson progress" on public.lesson_progress for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their curriculum preferences" on public.curriculum_preferences;
create policy "Users manage their curriculum preferences" on public.curriculum_preferences for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their vocabulary reviews" on public.vocabulary_review_items;
create policy "Users manage their vocabulary reviews" on public.vocabulary_review_items for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
