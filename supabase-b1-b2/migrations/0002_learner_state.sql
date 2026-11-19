-- ============================================================================
-- Learner state: profile, progress, vocabulary SRS, attempts, XP, reports.
-- Every table here is owned by exactly one auth user (see 0003_rls.sql).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Profile (created automatically for every auth user)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  full_name           text,
  avatar_url          text,
  learner_band        learner_band not null default 'B1_low',
  target_band         learner_band not null default 'B2_solid',
  xp_total            int not null default 0 check (xp_total >= 0),
  streak_days         int not null default 0 check (streak_days >= 0),
  longest_streak      int not null default 0 check (longest_streak >= 0),
  last_active_on      date,
  daily_word_goal     int not null default 10 check (daily_word_goal between 5 and 40),
  timezone            text not null default 'Europe/Madrid',
  onboarding_completed boolean not null default false,
  placement_result    jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.enrollments (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  course_id             uuid not null references public.courses(id) on delete cascade,
  current_lesson_number int not null default 1,
  started_at            timestamptz not null default now(),
  target_completion_date date,
  completed_at          timestamptz,
  unique (user_id, course_id)
);

create table if not exists public.lesson_progress (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  lesson_id         uuid not null references public.lessons(id) on delete cascade,
  status            progress_status not null default 'not_started',
  blocks_completed  smallint not null default 0 check (blocks_completed between 0 and 5),
  practice_correct  int not null default 0,
  practice_total    int not null default 0,
  output_submitted  boolean not null default false,
  started_at        timestamptz,
  completed_at      timestamptz,
  last_viewed_at    timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create table if not exists public.practice_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  item_id      uuid not null references public.practice_items(id) on delete cascade,
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  is_correct   boolean not null,
  response     text,
  attempted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Vocabulary spaced repetition.
-- Ladder from the architecture PDF: 1, 3, 7, 14, 30 (then 60) days.
-- ---------------------------------------------------------------------------
create table if not exists public.vocab_cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  vocab_item_id uuid not null references public.vocab_items(id) on delete cascade,
  card_kind     card_kind not null default 'definition',
  due_at        timestamptz not null default now(),
  ladder_step   smallint not null default 0 check (ladder_step between 0 and 5),
  interval_days int not null default 0,
  ease          numeric(3,2) not null default 2.50 check (ease between 1.30 and 3.50),
  reps          int not null default 0,
  lapses        int not null default 0,
  suspended     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, vocab_item_id, card_kind)
);

create table if not exists public.vocab_reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  card_id       uuid not null references public.vocab_cards(id) on delete cascade,
  vocab_item_id uuid not null references public.vocab_items(id) on delete cascade,
  grade         review_grade not null,
  interval_days int not null,
  due_at        timestamptz not null,
  reviewed_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Output: speaking + writing
-- ---------------------------------------------------------------------------
create table if not exists public.speaking_attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  task_id          uuid not null references public.speaking_tasks(id) on delete cascade,
  lesson_id        uuid references public.lessons(id) on delete set null,
  audio_path       text,
  mime_type        text,
  duration_seconds int,
  transcript       text,
  word_count       int,
  -- five criterion scores (0–5), matching the AI feedback contract
  fluency          numeric(3,1) check (fluency between 0 and 5),
  lexical_range    numeric(3,1) check (lexical_range between 0 and 5),
  grammar_accuracy numeric(3,1) check (grammar_accuracy between 0 and 5),
  coherence        numeric(3,1) check (coherence between 0 and 5),
  pronunciation    numeric(3,1) check (pronunciation between 0 and 5),
  overall          numeric(4,1),   -- 0–100
  feedback         jsonb not null default '{}'::jsonb,
  strengths        text[] not null default '{}',
  improvements     text[] not null default '{}',
  status           attempt_status not null default 'draft',
  ai_model         text,
  created_at       timestamptz not null default now(),
  evaluated_at     timestamptz
);

create table if not exists public.writing_submissions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  task_id          uuid not null references public.writing_tasks(id) on delete cascade,
  lesson_id        uuid references public.lessons(id) on delete set null,
  body             text not null default '',
  word_count       int not null default 0,
  task_response    numeric(3,1) check (task_response between 0 and 5),
  organisation     numeric(3,1) check (organisation between 0 and 5),
  grammar_accuracy numeric(3,1) check (grammar_accuracy between 0 and 5),
  lexical_range    numeric(3,1) check (lexical_range between 0 and 5),
  style            numeric(3,1) check (style between 0 and 5),
  overall          numeric(4,1),
  feedback         jsonb not null default '{}'::jsonb,
  corrections      jsonb not null default '[]'::jsonb,
  status           attempt_status not null default 'draft',
  ai_model         text,
  revised_from     uuid references public.writing_submissions(id) on delete set null,
  created_at       timestamptz not null default now(),
  evaluated_at     timestamptz
);

create table if not exists public.checkpoint_attempts (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  checkpoint_id        uuid not null references public.checkpoints(id) on delete cascade,
  status               attempt_status not null default 'draft',
  speaking_attempt_id  uuid references public.speaking_attempts(id) on delete set null,
  writing_submission_id uuid references public.writing_submissions(id) on delete set null,
  scores               jsonb not null default '{}'::jsonb,
  result               jsonb not null default '{}'::jsonb,
  started_at           timestamptz not null default now(),
  completed_at         timestamptz
);

-- ---------------------------------------------------------------------------
-- Gamification: XP ledger, skill meters, badges, weekly reports, daily plan
-- ---------------------------------------------------------------------------
create table if not exists public.xp_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  source     xp_source not null,
  points     int not null,
  ref_type   text,
  ref_id     uuid,
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists public.skill_levels (
  user_id           uuid not null references auth.users(id) on delete cascade,
  skill             skill_area not null,
  score             numeric(5,2) not null default 0 check (score between 0 and 100),
  xp                int not null default 0,
  lessons_completed int not null default 0,
  updated_at        timestamptz not null default now(),
  primary key (user_id, skill)
);

create table if not exists public.user_badges (
  user_id   uuid not null references auth.users(id) on delete cascade,
  badge_id  uuid not null references public.badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table if not exists public.weekly_reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  week_start     date not null,
  study_minutes  int not null default 0,
  words_learned  int not null default 0,
  recordings     int not null default 0,
  writing_tasks  int not null default 0,
  weakest_skill  skill_area,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists public.daily_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  session_date     date not null default current_date,
  lesson_id        uuid references public.lessons(id) on delete set null,
  plan             jsonb not null default '[]'::jsonb,
  completed_blocks smallint not null default 0,
  total_minutes    smallint,
  created_at       timestamptz not null default now(),
  unique (user_id, session_date)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists lesson_progress_user_idx   on public.lesson_progress (user_id, status);
create index if not exists practice_attempts_user_idx on public.practice_attempts (user_id, attempted_at desc);
create index if not exists vocab_cards_due_idx        on public.vocab_cards (user_id, due_at) where not suspended;
create index if not exists vocab_reviews_user_idx     on public.vocab_reviews (user_id, reviewed_at desc);
create index if not exists speaking_attempts_user_idx on public.speaking_attempts (user_id, created_at desc);
create index if not exists writing_subs_user_idx      on public.writing_submissions (user_id, created_at desc);
create index if not exists xp_events_user_idx         on public.xp_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers (learner tables)
-- ---------------------------------------------------------------------------
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists vocab_cards_touch on public.vocab_cards;
create trigger vocab_cards_touch before update on public.vocab_cards
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Private storage bucket for speaking recordings
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'speaking-recordings',
  'speaking-recordings',
  false,
  26214400, -- 25 MB
  array['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-m4a']
)
on conflict (id) do nothing;
