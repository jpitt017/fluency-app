-- ============================================================================
-- English B1 → B2: Independent User — core schema
-- Project ref: ebzmkhrssgnzmixfsuso (eu-west-1)
-- Source of truth: "English fluency Course Architecture.pdf"
--
-- Everything lives in `public` so PostgREST/supabase-js can reach it without
-- extra API-schema configuration. RLS is defined in 0002_rls.sql.
-- ============================================================================

create extension if not exists pgcrypto;

-- Used to keep vocabulary lookup fast while the deck library grows.
do $$
begin
  create extension if not exists pg_trgm;
exception when others then
  null; -- optional
end $$;

-- ---------------------------------------------------------------------------
-- Enumerated vocabulary
-- ---------------------------------------------------------------------------
do $$
begin
  create type cefr_level as enum ('B1', 'B2');
exception when duplicate_object then null;
end $$;

do $$
begin
  -- Learner bands used by the gamification ladder in the architecture PDF.
  create type learner_band as enum (
    'B1_low', 'B1_mid', 'B1_high', 'B1_plus', 'B2_entry', 'B2_developing', 'B2_solid'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type skill_area as enum (
    'grammar', 'vocabulary', 'listening', 'reading', 'speaking', 'writing', 'review'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  -- The five short blocks of the 20–45 minute daily session.
  create type block_kind as enum ('warm_up', 'input', 'practice', 'output', 'feedback');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type input_kind as enum ('listening', 'reading');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type item_kind as enum (
    'multiple_choice', 'gap_fill', 'transformation', 'true_false', 'collocation', 'short_answer'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type task_kind as enum (
    'prompt_card', 'role_play', 'shadowing', 'discussion', 'monologue', 'interview'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type card_kind as enum (
    'definition', 'gap_fill', 'collocation', 'translation', 'audio_recognition', 'sentence_production'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type review_grade as enum ('again', 'hard', 'good', 'easy');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type progress_status as enum ('not_started', 'in_progress', 'completed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type attempt_status as enum ('draft', 'submitted', 'evaluated');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type xp_source as enum (
    'lesson', 'practice', 'speaking', 'writing', 'vocab_review', 'streak', 'checkpoint', 'badge'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Curriculum (authored content — read-only for learners)
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  subtitle          text,
  description       text not null,
  level_from        cefr_level not null default 'B1',
  level_to          cefr_level not null default 'B2',
  total_hours       int not null check (total_hours > 0),
  weekly_hours      numeric(3,1),
  duration_weeks    int,
  daily_minutes_min int default 20,
  daily_minutes_max int default 45,
  -- e.g. ["warm_up","input","practice","output","feedback"] with the minutes
  -- budget from the "Daily app flow" section of the architecture.
  daily_flow        jsonb not null default '[]'::jsonb,
  -- e.g. [{ "skill": "grammar", "hours": 10 }, ...]
  skill_balance     jsonb not null default '[]'::jsonb,
  published         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.modules (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses(id) on delete cascade,
  module_number  int not null check (module_number > 0),
  title          text not null,
  summary        text not null,
  hours          int not null default 8,
  lesson_start   int not null,
  lesson_end     int not null,
  grammar_focus  text[] not null default '{}',
  vocabulary_topic text not null,
  skill_mix      jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (course_id, module_number),
  check (lesson_end >= lesson_start)
);

create table if not exists public.lessons (
  id                    uuid primary key default gen_random_uuid(),
  course_id             uuid not null references public.courses(id) on delete cascade,
  module_id             uuid not null references public.modules(id) on delete cascade,
  lesson_number         int not null,          -- global 1..64
  module_lesson_number  int not null,          -- 1..8 inside the module
  title                 text not null,
  objective             text not null,
  can_do                text not null,
  grammar_point_key     text,
  grammar_point         text,
  explanation           text not null default '',
  primary_skill         skill_area not null default 'grammar',
  duration_minutes      int not null default 12,
  xp_reward             int not null default 20,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (course_id, lesson_number),
  unique (module_id, module_lesson_number)
);

create table if not exists public.lesson_blocks (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  block_kind  block_kind not null,
  sort_order  smallint not null check (sort_order between 1 and 5),
  minutes     smallint not null check (minutes > 0),
  title       text not null,
  content     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (lesson_id, sort_order)
);

create table if not exists public.practice_items (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  kind          item_kind not null,
  sort_order    smallint not null default 1,
  prompt        text not null,
  options       jsonb,               -- array of strings for multiple_choice/collocation
  answer        text not null,
  explanation   text,
  grammar_point text,
  difficulty    smallint not null default 1 check (difficulty between 1 and 3),
  created_at    timestamptz not null default now(),
  unique (lesson_id, sort_order)
);

create table if not exists public.content_inputs (
  id               uuid primary key default gen_random_uuid(),
  module_id        uuid not null references public.modules(id) on delete cascade,
  lesson_id        uuid references public.lessons(id) on delete set null,
  kind             input_kind not null,
  title            text not null,
  source_label     text not null default 'Studio original',
  accent           text,
  body             text not null,        -- article text or transcript
  duration_seconds int,
  word_count       int,
  questions        jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);

create table if not exists public.speaking_tasks (
  id               uuid primary key default gen_random_uuid(),
  module_id        uuid not null references public.modules(id) on delete cascade,
  lesson_id        uuid references public.lessons(id) on delete set null,
  kind             task_kind not null default 'prompt_card',
  title            text not null,
  prompt           text not null,
  target_seconds   int not null default 120,
  useful_phrases   text[] not null default '{}',
  target_linkers   text[] not null default '{}',
  target_terms     text[] not null default '{}',
  -- criterion weights mirror the five scores the AI feedback must return
  rubric           jsonb not null default '{}'::jsonb,
  xp_reward        int not null default 40,
  created_at       timestamptz not null default now()
);

create table if not exists public.writing_tasks (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.modules(id) on delete cascade,
  lesson_id   uuid references public.lessons(id) on delete set null,
  title       text not null,
  prompt      text not null,
  format      text not null,
  word_min    int not null,
  word_max    int not null,
  outline     jsonb not null default '{}'::jsonb,  -- analyze/plan/draft/improve/review
  xp_reward   int not null default 40,
  created_at  timestamptz not null default now(),
  check (word_max >= word_min)
);

create table if not exists public.vocab_decks (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  module_id   uuid references public.modules(id) on delete cascade,
  slug        text not null unique,
  title       text not null,
  topic       text not null,
  description text not null default '',
  daily_target int not null default 10,
  created_at  timestamptz not null default now()
);

create table if not exists public.vocab_items (
  id             uuid primary key default gen_random_uuid(),
  deck_id        uuid not null references public.vocab_decks(id) on delete cascade,
  term           text not null,
  part_of_speech text not null default 'phrase',
  ipa            text,
  definition     text not null,
  example        text not null,
  collocations   text[] not null default '{}',
  translation_es text,
  band           cefr_level not null default 'B1',
  created_at     timestamptz not null default now(),
  unique (deck_id, term)
);

create table if not exists public.lesson_vocab (
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  vocab_item_id uuid not null references public.vocab_items(id) on delete cascade,
  sort_order    smallint not null default 1,
  primary key (lesson_id, vocab_item_id)
);

create table if not exists public.checkpoints (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses(id) on delete cascade,
  module_id        uuid references public.modules(id) on delete set null,
  code             text not null unique,
  title            text not null,
  timing_label     text not null,
  description      text not null,
  tasks            jsonb not null default '[]'::jsonb,
  duration_minutes int not null default 30,
  skills           skill_area[] not null default '{}',
  created_at       timestamptz not null default now()
);

create table if not exists public.badges (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  title       text not null,
  description text not null,
  icon        text not null default '🎖️',
  criteria    jsonb not null default '{}'::jsonb,
  xp_reward   int not null default 50,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes on the authored content
-- ---------------------------------------------------------------------------
create index if not exists modules_course_idx        on public.modules (course_id, module_number);
create index if not exists lessons_module_idx        on public.lessons (module_id, module_lesson_number);
create index if not exists lessons_course_idx        on public.lessons (course_id, lesson_number);
create index if not exists lesson_blocks_lesson_idx  on public.lesson_blocks (lesson_id, sort_order);
create index if not exists practice_items_lesson_idx on public.practice_items (lesson_id, sort_order);
create index if not exists content_inputs_module_idx on public.content_inputs (module_id, kind);
create index if not exists speaking_tasks_module_idx on public.speaking_tasks (module_id, kind);
create index if not exists writing_tasks_module_idx  on public.writing_tasks (module_id);
create index if not exists vocab_items_deck_idx      on public.vocab_items (deck_id, term);
create index if not exists lesson_vocab_lesson_idx   on public.lesson_vocab (lesson_id, sort_order);
create index if not exists vocab_items_term_trgm     on public.vocab_items using gin (term gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- updated_at triggers (curriculum)
-- ---------------------------------------------------------------------------
drop trigger if exists courses_touch on public.courses;
create trigger courses_touch before update on public.courses
  for each row execute function public.touch_updated_at();

drop trigger if exists modules_touch on public.modules;
create trigger modules_touch before update on public.modules
  for each row execute function public.touch_updated_at();

drop trigger if exists lessons_touch on public.lessons;
create trigger lessons_touch before update on public.lessons
  for each row execute function public.touch_updated_at();
