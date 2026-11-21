-- Reconcile the live B1-B2 project with migrations 0001-0023.
-- Idempotent: every object is created with IF NOT EXISTS / CREATE OR REPLACE,
-- and policies/triggers are dropped before recreation.

-- 1. Enum types --------------------------------------------------------------
do $$
begin
  if to_regtype('public.error_category') is null then
    create type public.error_category as enum (
      'article', 'preposition', 'tense', 'collocation', 'word_order', 'connector',
      'subject_verb', 'countable_uncountable', 'modal_verb', 'spelling',
      'punctuation', 'word_choice', 'other'
    );
  end if;
  if to_regtype('public.error_severity') is null then
    create type public.error_severity as enum ('minor', 'moderate', 'major');
  end if;
end $$;

-- 2. Missing tables ----------------------------------------------------------
create table if not exists public.learner_errors (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  source_type  text not null check (source_type in
    ('writing', 'speaking', 'checkpoint_writing', 'checkpoint_speaking', 'mediation')),
  source_id    uuid,
  lesson_id    uuid references public.lessons(id) on delete set null,
  category     public.error_category not null,
  other_label  text,
  original     text not null,
  corrected    text not null,
  explanation  text not null,
  severity     public.error_severity not null default 'moderate',
  source_word_count int,
  created_at   timestamptz not null default now()
);
create index if not exists learner_errors_user_cat_idx
  on public.learner_errors (user_id, category, created_at desc);

create table if not exists public.error_review_cards (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  learner_error_id   uuid references public.learner_errors(id) on delete set null,
  category           public.error_category not null,
  prompt_sentence    text not null,
  corrected_sentence text not null,
  explanation        text not null,
  due_at             timestamptz not null default now(),
  interval_days      int not null default 0,
  ease               numeric(3,2) not null default 2.50,
  stability          numeric(10,4) not null default 0,
  difficulty         numeric(6,4) not null default 5.0,
  fsrs_state         smallint not null default 0,
  learning_steps     smallint not null default 0,
  reps               int not null default 0,
  lapses             int not null default 0,
  suspended          boolean not null default false,
  last_review_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  normalized_key     text,
  context_sentence   text,
  card_format        text not null default 'fix_sentence',
  occurrence_count   int not null default 1,
  mastered           boolean not null default false,
  mastered_at        timestamptz,
  last_attempt_text  text,
  hint_revealed_at   timestamptz
);
create index if not exists error_review_cards_due_idx
  on public.error_review_cards (user_id, due_at) where not suspended;
create unique index if not exists error_review_cards_user_cat_norm_idx
  on public.error_review_cards (user_id, category, normalized_key)
  where normalized_key is not null;

create table if not exists public.ai_request_logs (
  id                bigint generated always as identity primary key,
  user_id           uuid references auth.users(id) on delete set null,
  endpoint          text not null,
  model             text not null,
  status_code       smallint not null,
  latency_ms        int not null check (latency_ms >= 0),
  cache_hit         boolean not null default false,
  audio_seconds     int not null default 0,
  input_chars       int not null default 0,
  prompt_tokens     int not null default 0,
  completion_tokens int not null default 0,
  estimated_cost_usd numeric(10,6) not null default 0,
  error_message     text,
  created_at        timestamptz not null default now()
);
create index if not exists ai_request_logs_user_time_idx
  on public.ai_request_logs (user_id, created_at desc);
create index if not exists ai_request_logs_endpoint_time_idx
  on public.ai_request_logs (endpoint, created_at desc);

create table if not exists public.ai_evaluation_cache (
  cache_key  text primary key,
  endpoint   text not null,
  model      text not null,
  response   jsonb not null,
  hit_count  int not null default 1,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz not null default now()
);

create table if not exists public.placement_questions (
  id           uuid primary key default gen_random_uuid(),
  sort_order   smallint not null unique,
  area         text not null,
  question     text not null,
  options      jsonb not null,
  answer_index smallint not null check (answer_index >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- 3. Missing columns on existing tables --------------------------------------
alter table public.checkpoint_attempts
  add column if not exists teacher_status text check (teacher_status in ('pending','confirmed','needs_work','overridden')),
  add column if not exists teacher_notes text,
  add column if not exists teacher_readiness_decision text check (teacher_readiness_decision in ('ready_for_b2_exam_prep','named_next_step')),
  add column if not exists teacher_reviewed_at timestamptz,
  add column if not exists teacher_reviewed_by uuid references auth.users(id) on delete set null;
alter table public.content_inputs
  add column if not exists audio_url text,
  add column if not exists speaker_accents jsonb not null default '[]'::jsonb;
alter table public.courses
  add column if not exists min_hours int not null default 55,
  add column if not exists live_lessons_per_week jsonb not null default '{"count":2,"minutes":[60,55]}'::jsonb,
  add column if not exists positioning text;
alter table public.lessons
  add column if not exists day_of_week text,
  add column if not exists session_requirement text not null default 'optional',
  add column if not exists output_required boolean not null default false;
alter table public.modules
  add column if not exists week_number int,
  add column if not exists phase_label text,
  add column if not exists light_grammar_focus text,
  add column if not exists vocab_pack jsonb not null default '{}'::jsonb;
alter table public.practice_items
  add column if not exists accepted_answers text[];
alter table public.speaking_attempts
  add column if not exists teacher_status text check (teacher_status in ('pending','confirmed','needs_work','overridden')),
  add column if not exists teacher_notes text,
  add column if not exists teacher_pronunciation_note text,
  add column if not exists teacher_reviewed_at timestamptz,
  add column if not exists teacher_reviewed_by uuid references auth.users(id) on delete set null;
alter table public.speaking_tasks
  add column if not exists model_answer text,
  add column if not exists b2_stretch text;
alter table public.vocab_cards
  add column if not exists stability numeric(10,4) not null default 0,
  add column if not exists difficulty numeric(6,4) not null default 5.0,
  add column if not exists fsrs_state smallint not null default 0,
  add column if not exists learning_steps smallint not null default 0,
  add column if not exists last_review_at timestamptz;
alter table public.vocab_items
  add column if not exists audio_url text,
  add column if not exists word_family text[] not null default '{}',
  add column if not exists audio_ref text,
  add column if not exists usage_note text,
  add column if not exists sentence_prompt text,
  add column if not exists gap_fill jsonb,
  add column if not exists teaching_role text;
alter table public.writing_submissions
  add column if not exists teacher_status text check (teacher_status in ('pending','confirmed','needs_work','overridden')),
  add column if not exists teacher_notes text,
  add column if not exists teacher_reviewed_at timestamptz,
  add column if not exists teacher_reviewed_by uuid references auth.users(id) on delete set null;

-- Keep source_word_count on learner_errors for projects created before 0010.
alter table public.learner_errors
  add column if not exists other_label text,
  add column if not exists source_word_count int;

-- 4. Functions missing from the live project (from migrations 0001-0023)

-- get_due_cards(int) is absent; live only has the (int, text) overload.
create or replace function public.get_due_cards(p_limit int default 20)
returns table (
  card_id        uuid,
  vocab_item_id  uuid,
  term           text,
  part_of_speech text,
  ipa            text,
  definition     text,
  example        text,
  collocations   text[],
  translation_es text,
  audio_url      text,
  deck_slug      text,
  deck_title     text,
  ladder_step    smallint,
  interval_days  int,
  stability      numeric,
  difficulty     numeric,
  fsrs_state     smallint,
  learning_steps smallint,
  reps           int,
  lapses         int,
  last_review_at timestamptz,
  due_at         timestamptz
)
language sql
security invoker
stable
as $$
  select c.id,
         vi.id,
         vi.term,
         vi.part_of_speech,
         vi.ipa,
         vi.definition,
         vi.example,
         vi.collocations,
         vi.translation_es,
         vi.audio_url,
         vd.slug,
         vd.title,
         c.ladder_step,
         c.interval_days,
         c.stability,
         c.difficulty,
         c.fsrs_state,
         c.learning_steps,
         c.reps,
         c.lapses,
         c.last_review_at,
         c.due_at
  from public.vocab_cards c
  join public.vocab_items vi on vi.id = c.vocab_item_id
  join public.vocab_decks vd on vd.id = vi.deck_id
  where c.user_id = auth.uid()
    and not c.suspended
    and c.due_at <= now()
  order by c.due_at
  limit least(coalesce(p_limit, 20), 100);
$$;

create or replace function public.apply_fsrs_review(
  p_card_type      text,
  p_card_id        uuid,
  p_grade          review_grade,
  p_due_at         timestamptz,
  p_interval_days  int,
  p_stability      numeric,
  p_difficulty     numeric,
  p_fsrs_state     smallint,
  p_learning_steps smallint,
  p_reps           int,
  p_lapses         int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_points     int;
  v_step       smallint;
  v_vocab_item uuid;
  v_cat        error_category;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_points := case p_grade
    when 'again' then 0
    when 'hard'  then 1
    when 'good'  then 2
    when 'easy'  then 3
  end;

  v_step := case
    when p_interval_days >= 60 then 5
    when p_interval_days >= 30 then 4
    when p_interval_days >= 14 then 3
    when p_interval_days >= 7  then 2
    when p_interval_days >= 3  then 1
    else 0
  end;

  if p_card_type = 'vocab' then
    update public.vocab_cards
       set due_at         = p_due_at,
           interval_days  = greatest(0, p_interval_days),
           stability      = greatest(0, p_stability),
           difficulty     = greatest(1, least(10, p_difficulty)),
           fsrs_state     = p_fsrs_state,
           learning_steps = greatest(0, p_learning_steps),
           reps           = greatest(0, p_reps),
           lapses         = greatest(0, p_lapses),
           ladder_step    = v_step,
           last_review_at = now(),
           updated_at     = now()
     where id = p_card_id and user_id = v_uid
    returning vocab_item_id into v_vocab_item;

    if v_vocab_item is null then
      raise exception 'Card not found' using errcode = 'no_data_found';
    end if;

    insert into public.vocab_reviews (user_id, card_id, vocab_item_id, grade, interval_days, due_at)
    values (v_uid, p_card_id, v_vocab_item, p_grade, greatest(0, p_interval_days), p_due_at);

    if v_points > 0 then
      perform public.award_xp(v_uid, 'vocab_review', v_points, 'vocab_item', v_vocab_item,
        format('FSRS review: %s', p_grade));
    end if;
  elsif p_card_type = 'error' then
    update public.error_review_cards
       set due_at         = p_due_at,
           interval_days  = greatest(0, p_interval_days),
           stability      = greatest(0, p_stability),
           difficulty     = greatest(1, least(10, p_difficulty)),
           fsrs_state     = p_fsrs_state,
           learning_steps = greatest(0, p_learning_steps),
           reps           = greatest(0, p_reps),
           lapses         = greatest(0, p_lapses),
           last_review_at = now(),
           updated_at     = now()
     where id = p_card_id and user_id = v_uid
    returning category into v_cat;

    if v_cat is null then
      raise exception 'Error review card not found' using errcode = 'no_data_found';
    end if;

    if v_points > 0 then
      perform public.award_xp(v_uid, 'practice', v_points, 'error_review_card', p_card_id,
        format('Error FSRS (%s): %s', v_cat, p_grade));
    end if;
  else
    raise exception 'Invalid card type' using errcode = '22023';
  end if;

  perform public.record_activity(v_uid);

  return jsonb_build_object(
    'card_id', p_card_id,
    'card_type', p_card_type,
    'grade', p_grade,
    'interval_days', greatest(0, p_interval_days),
    'due_at', p_due_at,
    'ladder_step', v_step,
    'xp', v_points
  );
end;
$$;

create or replace function public.cleanup_expired_retention_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cache_deleted int := 0;
  v_logs_deleted  int := 0;
  v_usage_deleted int := 0;
  v_audio_paths   text[];
begin
  delete from public.ai_evaluation_cache
   where last_hit_at < now() - interval '90 days';
  get diagnostics v_cache_deleted = row_count;

  delete from public.ai_request_logs
   where created_at < now() - interval '12 months';
  get diagnostics v_logs_deleted = row_count;

  delete from public.ai_usage_events
   where occurred_at < now() - interval '12 months';
  get diagnostics v_usage_deleted = row_count;

  select coalesce(array_agg(audio_path) filter (where audio_path is not null and audio_path <> ''), '{}')
    into v_audio_paths
    from public.speaking_attempts
   where created_at < now() - interval '12 months'
     and audio_path is not null;

  update public.speaking_attempts
     set audio_path = null
   where created_at < now() - interval '12 months'
     and audio_path is not null;

  return jsonb_build_object(
    'cache_deleted', v_cache_deleted,
    'logs_deleted', v_logs_deleted,
    'usage_deleted', v_usage_deleted,
    'expired_audio_paths', to_jsonb(v_audio_paths)
  );
end;
$$;

create or replace function public.delete_my_learning_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_audio_paths text[];
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select coalesce(array_agg(audio_path) filter (where audio_path is not null and audio_path <> ''), '{}')
    into v_audio_paths
    from public.speaking_attempts
   where user_id = v_uid;

  delete from public.error_review_cards where user_id = v_uid;
  delete from public.learner_errors where user_id = v_uid;
  delete from public.vocab_reviews where user_id = v_uid;
  delete from public.vocab_cards where user_id = v_uid;
  delete from public.vocabulary_review_items where user_id = v_uid;
  delete from public.practice_attempts where user_id = v_uid;
  delete from public.checkpoint_attempts where user_id = v_uid;
  delete from public.cefr_checkpoint_attempts where user_id = v_uid;
  delete from public.cefr_objective_progress where user_id = v_uid;
  delete from public.speaking_attempts where user_id = v_uid;
  delete from public.writing_submissions where user_id = v_uid;
  delete from public.lesson_progress where user_id = v_uid;
  delete from public.daily_sessions where user_id = v_uid;
  delete from public.progress_logs where user_id = v_uid;
  delete from public.skill_levels where user_id = v_uid;
  delete from public.weekly_reports where user_id = v_uid;
  delete from public.xp_events where user_id = v_uid;
  delete from public.user_badges where user_id = v_uid;
  delete from public.curriculum_preferences where user_id = v_uid;
  delete from public.enrollments where user_id = v_uid;
  delete from public.ai_request_logs where user_id = v_uid;
  delete from public.ai_usage_events where user_id = v_uid;

  delete from public.ai_evaluation_cache
   where last_hit_at < now() - interval '90 days';

  update public.profiles
     set placement_result     = null,
         onboarding_completed = false,
         streak_days          = 0,
         xp                   = 0,
         updated_at           = now()
   where id = v_uid;

  return jsonb_build_object(
    'deleted', true,
    'audio_paths', to_jsonb(v_audio_paths)
  );
end;
$$;

create or replace function public.enforce_output_before_progress()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lesson      public.lessons;
  v_has_output  boolean := coalesce(new.output_submitted, false);
begin
  if not v_has_output then
    select (
      exists (
        select 1 from public.speaking_attempts sa
        where sa.user_id = new.user_id and sa.lesson_id = new.lesson_id
      )
      or exists (
        select 1 from public.writing_submissions ws
        where ws.user_id = new.user_id and ws.lesson_id = new.lesson_id
      )
    ) into v_has_output;

    if v_has_output then
      new.output_submitted := true;
    end if;
  end if;

  if new.status = 'completed' then
    select * into v_lesson from public.lessons where id = new.lesson_id;
    if found and v_lesson.output_required and not coalesce(new.output_submitted, false) then
      raise exception 'Output before progress: complete the required speaking or writing task before marking this session complete.'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.get_ai_eval_cache(p_cache_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_evaluation_cache;
begin
  if auth.uid() is null then
    return null;
  end if;

  update public.ai_evaluation_cache
     set hit_count   = hit_count + 1,
         last_hit_at = now()
   where cache_key = p_cache_key
     and created_at > now() - interval '30 days'
  returning * into v_row;

  if not found then
    return null;
  end if;

  return v_row.response;
end;
$$;

create or replace function public.get_ai_observability_summary(p_days int default 7)
returns jsonb
language sql
security invoker
stable
as $$
  with scoped as (
    select *
    from public.ai_request_logs
    where user_id = auth.uid()
      and created_at >= now() - make_interval(days => greatest(1, least(p_days, 90)))
  ),
  by_endpoint as (
    select endpoint,
           count(*) as requests,
           count(*) filter (where cache_hit) as cache_hits,
           count(*) filter (where status_code >= 400) as failures,
           round(avg(latency_ms))::int as avg_latency_ms,
           round(sum(estimated_cost_usd)::numeric, 5) as total_cost_usd
    from scoped
    group by endpoint
  )
  select jsonb_build_object(
    'days', greatest(1, least(p_days, 90)),
    'total_requests', (select count(*) from scoped),
    'cache_hits', (select count(*) from scoped where cache_hit),
    'cache_hit_rate', coalesce((select round((count(*) filter (where cache_hit))::numeric * 100 / nullif(count(*), 0), 1) from scoped), 0),
    'failure_count', (select count(*) from scoped where status_code >= 400),
    'avg_latency_ms', coalesce((select round(avg(latency_ms))::int from scoped), 0),
    'total_cost_usd', coalesce((select round(sum(estimated_cost_usd)::numeric, 5) from scoped), 0),
    'endpoints', coalesce((select jsonb_agg(to_jsonb(e) order by e.requests desc) from by_endpoint e), '[]'::jsonb)
  );
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('teacher', 'admin')
  );
$$;

create or replace function public.log_ai_request(
  p_endpoint          text,
  p_model             text,
  p_status_code       smallint,
  p_latency_ms        int,
  p_cache_hit         boolean default false,
  p_audio_seconds     int default 0,
  p_input_chars       int default 0,
  p_prompt_tokens     int default 0,
  p_completion_tokens int default 0,
  p_estimated_cost_usd numeric default 0,
  p_error_message     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_request_logs (
    user_id, endpoint, model, status_code, latency_ms, cache_hit,
    audio_seconds, input_chars, prompt_tokens, completion_tokens,
    estimated_cost_usd, error_message
  )
  values (
    auth.uid(), p_endpoint, p_model, p_status_code, greatest(0, p_latency_ms), coalesce(p_cache_hit, false),
    greatest(0, p_audio_seconds), greatest(0, p_input_chars),
    greatest(0, p_prompt_tokens), greatest(0, p_completion_tokens),
    greatest(0, p_estimated_cost_usd), left(p_error_message, 300)
  );
end;
$$;

create or replace function public.mark_error_card_mastered(
  p_card_id      uuid,
  p_attempt_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_cat           error_category;
  v_revealed_at   timestamptz;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select category, hint_revealed_at
    into v_cat, v_revealed_at
    from public.error_review_cards
   where id = p_card_id and user_id = v_uid;

  if v_cat is null then
    raise exception 'Error review card not found' using errcode = 'no_data_found';
  end if;

  -- Block same-session copy-paste mastery after clicking reveal
  if v_revealed_at is not null and v_revealed_at > now() - interval '6 hours' then
    return jsonb_build_object(
      'card_id', p_card_id,
      'mastered', false,
      'xp', 0,
      'reason', 'revealed_recently'
    );
  end if;

  update public.error_review_cards
     set mastered          = true,
         mastered_at       = now(),
         suspended         = true,
         last_attempt_text = p_attempt_text,
         last_review_at    = now(),
         reps              = reps + 1,
         updated_at        = now()
   where id = p_card_id and user_id = v_uid;

  perform public.award_xp(v_uid, 'practice', 5, 'error_review_mastered', p_card_id,
    format('Mastered %s repair unprompted', v_cat));
  perform public.record_activity(v_uid);

  return jsonb_build_object('card_id', p_card_id, 'mastered', true, 'xp', 5);
end;
$$;

create or replace function public.reveal_error_card_hint(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.error_review_cards
     set hint_revealed_at = now(),
         updated_at       = now()
   where id = p_card_id and user_id = v_uid;
end;
$$;

create or replace function public.set_ai_eval_cache(
  p_cache_key text,
  p_endpoint  text,
  p_model     text,
  p_response  jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into public.ai_evaluation_cache (cache_key, endpoint, model, response)
  values (p_cache_key, p_endpoint, p_model, p_response)
  on conflict (cache_key) do update
    set response    = excluded.response,
        model       = excluded.model,
        last_hit_at = now();
end;
$$;

create or replace function public.teacher_get_roster()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'Teacher access required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(learner_row order by learner_row->>'full_name', learner_row->>'user_id')
    from (
      select jsonb_build_object(
        'user_id', p.id,
        'full_name', coalesce(p.full_name, split_part(coalesce(p.email, 'Learner'), '@', 1)),
        'email', p.email,
        'learner_band', p.learner_band,
        'streak_days', p.streak_days,
        'longest_streak', p.longest_streak,
        'last_active_on', p.last_active_on,
        'current_lesson_number', coalesce((
          select e.current_lesson_number from public.enrollments e
          where e.user_id = p.id order by e.started_at desc limit 1
        ), 1),
        'total_sessions_completed', (
          select count(*)::int from public.lesson_progress lp
          where lp.user_id = p.id and lp.status = 'completed'
        ),
        'listening_weeks', (
          select count(distinct l.module_id)::int
          from public.lesson_progress lp
          join public.lessons l on l.id = lp.lesson_id
          where lp.user_id = p.id and lp.status = 'completed' and l.primary_skill = 'listening'
        ),
        'reading_weeks', (
          select count(distinct l.module_id)::int
          from public.lesson_progress lp
          join public.lessons l on l.id = lp.lesson_id
          where lp.user_id = p.id and lp.status = 'completed' and l.primary_skill = 'reading'
        ),
        'weeks', coalesce((
          select jsonb_agg(jsonb_build_object(
            'week_number', coalesce(m.week_number, m.module_number),
            'title', m.title,
            'sessions_completed', (
              select count(*)::int from public.lesson_progress lp
              join public.lessons l on l.id = lp.lesson_id
              where lp.user_id = p.id and l.module_id = m.id and lp.status = 'completed'
            ),
            'wed_or_thu_done', exists (
              select 1 from public.lesson_progress lp
              join public.lessons l on l.id = lp.lesson_id
              where lp.user_id = p.id and l.module_id = m.id
                and l.day_of_week in ('Wed', 'Thu') and lp.status = 'completed'
            ),
            'fri_speaking_done', exists (
              select 1 from public.lesson_progress lp
              join public.lessons l on l.id = lp.lesson_id
              where lp.user_id = p.id and l.module_id = m.id
                and l.day_of_week = 'Fri' and lp.status = 'completed'
            ),
            'sat_writing_done', exists (
              select 1 from public.lesson_progress lp
              join public.lessons l on l.id = lp.lesson_id
              where lp.user_id = p.id and l.module_id = m.id
                and l.day_of_week = 'Sat' and lp.status = 'completed'
            )
          ) order by m.module_number)
          from public.modules m
        ), '[]'::jsonb),
        'checkpoints', coalesce((
          select jsonb_agg(jsonb_build_object(
            'attempt_id', ca.id,
            'code', cp.code,
            'title', cp.title,
            'timing', cp.timing_label,
            'status', ca.status,
            'scores', ca.scores,
            'result', ca.result,
            'teacher_status', ca.teacher_status,
            'teacher_notes', ca.teacher_notes,
            'teacher_readiness_decision', ca.teacher_readiness_decision,
            'completed_at', ca.completed_at
          ) order by cp.timing_label)
          from public.checkpoint_attempts ca
          join public.checkpoints cp on cp.id = ca.checkpoint_id
          where ca.user_id = p.id
        ), '[]'::jsonb),
        'top_errors', coalesce((
          select jsonb_agg(jsonb_build_object(
            'error_category', err.error_category,
            'occurrences', err.occurrences,
            'examples', err.examples
          ) order by err.occurrences desc)
          from (
            select erc.category::text as error_category,
                   sum(coalesce(erc.occurrence_count, 1))::int as occurrences,
                   jsonb_agg(jsonb_build_object(
                     'incorrect', erc.prompt_sentence,
                     'target', erc.corrected_sentence,
                     'explanation', erc.explanation
                   ) order by erc.created_at desc) as examples
            from public.error_review_cards erc
            where erc.user_id = p.id
            group by erc.category
            order by sum(coalesce(erc.occurrence_count, 1)) desc
            limit 5
          ) err
        ), '[]'::jsonb),
        'recent_speaking', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', sa.id,
            'task_title', st.title,
            'duration_seconds', sa.duration_seconds,
            'transcript', sa.transcript,
            'overall', sa.overall,
            'feedback', sa.feedback,
            'teacher_status', coalesce(sa.teacher_status, 'pending'),
            'teacher_notes', sa.teacher_notes,
            'teacher_pronunciation_note', sa.teacher_pronunciation_note,
            'created_at', sa.created_at
          ) order by sa.created_at desc)
          from (
            select * from public.speaking_attempts
            where user_id = p.id
            order by created_at desc
            limit 5
          ) sa
          left join public.speaking_tasks st on st.id = sa.task_id
        ), '[]'::jsonb),
        'recent_writing', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ws.id,
            'task_title', wt.title,
            'body', ws.body,
            'word_count', ws.word_count,
            'overall', ws.overall,
            'feedback', ws.feedback,
            'corrections', ws.corrections,
            'teacher_status', coalesce(ws.teacher_status, 'pending'),
            'teacher_notes', ws.teacher_notes,
            'created_at', ws.created_at
          ) order by ws.created_at desc)
          from (
            select * from public.writing_submissions
            where user_id = p.id
            order by created_at desc
            limit 5
          ) ws
          left join public.writing_tasks wt on wt.id = ws.task_id
        ), '[]'::jsonb)
      ) as learner_row
      from public.profiles p
      where p.role = 'learner'
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.teacher_submit_review(
  p_target_type text,
  p_target_id uuid,
  p_teacher_status text,
  p_teacher_notes text default null,
  p_pronunciation_note text default null,
  p_readiness_decision text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_reviewer uuid := auth.uid();
begin
  if v_reviewer is null or not public.is_teacher() then
    raise exception 'Teacher access required' using errcode = '42501';
  end if;

  if p_teacher_status not in ('pending', 'confirmed', 'needs_work', 'overridden') then
    raise exception 'Invalid teacher_status' using errcode = '22023';
  end if;

  if p_target_type = 'speaking' then
    update public.speaking_attempts
       set teacher_status = p_teacher_status,
           teacher_notes = p_teacher_notes,
           teacher_pronunciation_note = p_pronunciation_note,
           teacher_reviewed_at = now(),
           teacher_reviewed_by = v_reviewer
     where id = p_target_id;
  elsif p_target_type = 'writing' then
    update public.writing_submissions
       set teacher_status = p_teacher_status,
           teacher_notes = p_teacher_notes,
           teacher_reviewed_at = now(),
           teacher_reviewed_by = v_reviewer
     where id = p_target_id;
  elsif p_target_type = 'checkpoint' then
    update public.checkpoint_attempts
       set teacher_status = p_teacher_status,
           teacher_notes = p_teacher_notes,
           teacher_readiness_decision = p_readiness_decision,
           teacher_reviewed_at = now(),
           teacher_reviewed_by = v_reviewer
     where id = p_target_id;
  else
    raise exception 'Invalid target_type' using errcode = '22023';
  end if;

  if not found then
    raise exception 'Target record not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'target_id', p_target_id, 'teacher_status', p_teacher_status);
end;
$$;

create or replace function public.verify_delete_my_learning_data_coverage()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_fn_def   text;
  v_missing  text[] := '{}';
  v_tbl      text;
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure)
    into v_fn_def;

  for v_tbl in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'user_id'
       and t.table_type = 'BASE TABLE'
       and c.table_name not in ('subscriptions')
     order by c.table_name
  loop
    if position('public.' || v_tbl in v_fn_def) = 0 then
      v_missing := array_append(v_missing, v_tbl);
    end if;
  end loop;

  return jsonb_build_object(
    'covered', coalesce(array_length(v_missing, 1), 0) = 0,
    'missing_tables', to_jsonb(v_missing)
  );
end;
$$;

-- The account-deletion RPC predates mediation_attempts; keep drift coverage happy.
do $$
declare
  function_def text;
begin
  if to_regprocedure('public.delete_my_learning_data()') is not null then
    select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into function_def;
    if position('public.mediation_attempts' in function_def) = 0 then
      function_def := replace(
        function_def,
        'delete from public.error_review_cards where user_id = v_uid;',
        'delete from public.mediation_attempts where user_id = v_uid;' || chr(10) ||
        '  delete from public.error_review_cards where user_id = v_uid;'
      );
      execute function_def;
    end if;
  end if;
end $$;

-- 5. Views -------------------------------------------------------------------
drop view if exists public.placement_questions_safe;
create view public.placement_questions_safe as
  select id, sort_order, area, question, options
  from public.placement_questions
  where active = true;

-- 6. RLS and policies --------------------------------------------------------
alter table public.learner_errors enable row level security;
alter table public.error_review_cards enable row level security;
alter table public.ai_request_logs enable row level security;
alter table public.ai_evaluation_cache enable row level security;
alter table public.placement_questions enable row level security;

drop policy if exists "own errors select" on public.learner_errors;
create policy "own errors select" on public.learner_errors
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists "own errors insert" on public.learner_errors;
create policy "own errors insert" on public.learner_errors
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "own errors update" on public.learner_errors;
create policy "own errors update" on public.learner_errors
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own errors delete" on public.learner_errors;
create policy "own errors delete" on public.learner_errors
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "own error cards select" on public.error_review_cards;
create policy "own error cards select" on public.error_review_cards
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists "own error cards insert" on public.error_review_cards;
create policy "own error cards insert" on public.error_review_cards
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "own error cards update" on public.error_review_cards;
create policy "own error cards update" on public.error_review_cards
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own error cards delete" on public.error_review_cards;
create policy "own error cards delete" on public.error_review_cards
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "own ai logs select" on public.ai_request_logs;
create policy "own ai logs select" on public.ai_request_logs
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

drop policy if exists "public read placement questions" on public.placement_questions;
create policy "public read placement questions" on public.placement_questions
  for select to anon, authenticated using (active);
drop policy if exists "placement_questions_staff_read" on public.placement_questions;
create policy "placement_questions_staff_read" on public.placement_questions
  for select to authenticated using (public.is_staff());

-- 7. Triggers ----------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists error_review_cards_touch on public.error_review_cards;
create trigger error_review_cards_touch before update on public.error_review_cards
  for each row execute function public.touch_updated_at();

drop trigger if exists lesson_progress_output_gate on public.lesson_progress;
create trigger lesson_progress_output_gate
  before insert or update of output_submitted, status on public.lesson_progress
  for each row execute function public.enforce_output_before_progress();

-- 8. Storage bucket ----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-audio', 'course-audio', true, 26214400,
  array['audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/mp4','audio/webm']
)
on conflict (id) do nothing;
drop policy if exists "public read course audio" on storage.objects;
create policy "public read course audio" on storage.objects
  for select to anon, authenticated using (bucket_id = 'course-audio');

-- 9. Grants ------------------------------------------------------------------
grant select, insert, update, delete on public.learner_errors to authenticated;
grant select, insert, update, delete on public.error_review_cards to authenticated;
grant select on public.ai_request_logs to authenticated;
grant select, insert, update, delete on public.ai_evaluation_cache to authenticated;
grant select on public.placement_questions to anon, authenticated;
grant select on public.placement_questions_safe to anon, authenticated;

grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.strip_answer_fields(jsonb) to authenticated;
grant execute on function public.consume_ai_usage(text, integer) to authenticated;
grant execute on function public.get_due_cards(int) to authenticated;
grant execute on function public.get_ai_eval_cache(text) to authenticated;
grant execute on function public.set_ai_eval_cache(text, text, text, jsonb) to authenticated;
grant execute on function public.log_ai_request(text, text, smallint, int, boolean, int, int, int, int, numeric, text) to anon, authenticated;
grant execute on function public.apply_fsrs_review(text, uuid, review_grade, timestamptz, int, numeric, numeric, smallint, smallint, int, int) to authenticated;
grant execute on function public.mark_error_card_mastered(uuid, text) to authenticated;
grant execute on function public.reveal_error_card_hint(uuid) to authenticated;
grant execute on function public.delete_my_learning_data() to authenticated;
grant execute on function public.verify_delete_my_learning_data_coverage() to service_role;
grant execute on function public.cleanup_expired_retention_data() to service_role;
grant execute on function public.teacher_get_roster() to authenticated;
grant execute on function public.teacher_submit_review(text, uuid, text, text, text, text) to authenticated;

-- 10. CI guard: fails when a table used by the app is absent from the live project.
create or replace function public.verify_app_schema()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with expected(name) as (
    values
      ('ai_evaluation_cache'), ('ai_request_logs'), ('ai_usage_events'), ('badges'),
      ('checkpoint_attempts'), ('checkpoints'), ('content_inputs'), ('courses'),
      ('curriculum_preferences'), ('daily_sessions'), ('enrollments'), ('error_review_cards'),
      ('learner_errors'), ('lesson_blocks'), ('lesson_progress'), ('lesson_vocab'), ('lessons'),
      ('mediation_attempts'), ('modules'), ('placement_questions'), ('practice_attempts'),
      ('practice_items'), ('profiles'), ('skill_levels'), ('speaking_attempts'),
      ('speaking_tasks'), ('stripe_events'), ('subscriptions'), ('syllabus_assessments'),
      ('syllabus_checkpoint_items'), ('syllabus_checkpoints'), ('syllabus_course'),
      ('syllabus_grammar_items'), ('syllabus_input_items'), ('syllabus_skill_ladders'),
      ('syllabus_stages'), ('syllabus_vocab_items'), ('syllabus_week_details'),
      ('syllabus_weekly_tasks'), ('syllabus_weeks'), ('user_badges'), ('vocab_cards'),
      ('vocab_decks'), ('vocab_items'), ('vocab_reviews'), ('weekly_reports'),
      ('writing_submissions'), ('writing_tasks'), ('xp_events')
  )
  select jsonb_build_object(
    'covered', bool_and(to_regclass('public.' || name) is not null),
    'missing_tables', coalesce((
      select jsonb_agg(name order by name)
      from expected
      where to_regclass('public.' || name) is null
    ), '[]'::jsonb)
  )
  from expected;
$$;

revoke all on function public.verify_app_schema() from public;
grant execute on function public.verify_app_schema() to anon, authenticated, service_role;

-- -- Reconcile drifted consume_ai_usage with the current repo behaviour (free/pro tiers and /api/review/check-rewrite).
create or replace function public.consume_ai_usage(p_endpoint text, p_units integer)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_user_id          uuid := auth.uid();
  v_now              timestamptz := clock_timestamp();
  v_sub_status       text;
  v_is_pro           boolean;
  v_minute_requests  integer;
  v_daily_units      integer;
  v_minute_limit     integer;
  v_daily_unit_limit integer;
  v_retry_seconds    integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_endpoint not in (
    '/api/speaking/chat', '/api/speaking/evaluate', '/api/writing/correct',
    '/api/checkpoints/evaluate', '/api/checkpoints/writing', '/api/lessons/generate',
    '/api/review/check-rewrite'
  ) or p_units < 1 or p_units > 20 then
    raise exception 'invalid AI usage request' using errcode = '22023';
  end if;

  select subscription_status into v_sub_status
    from public.profiles
   where id = v_user_id;

  v_is_pro := coalesce(v_sub_status, '') in ('active', 'trialing');
  v_minute_limit := case when v_is_pro then 12 else 5 end;
  v_daily_unit_limit := case when v_is_pro then 180 else 30 end;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text), hashtext('ai_usage'));

  delete from public.ai_usage_events
    where user_id = v_user_id and occurred_at < v_now - interval '30 days';

  select count(*)::integer into v_minute_requests
    from public.ai_usage_events
    where user_id = v_user_id and occurred_at > v_now - interval '1 minute';

  select coalesce(sum(units), 0)::integer into v_daily_units
    from public.ai_usage_events
    where user_id = v_user_id and occurred_at > v_now - interval '24 hours';

  if v_minute_requests >= v_minute_limit then
    select greatest(1, ceil(extract(epoch from (min(occurred_at) + interval '1 minute' - v_now)))::integer)
      into v_retry_seconds
      from public.ai_usage_events
      where user_id = v_user_id and occurred_at > v_now - interval '1 minute';
    return jsonb_build_object(
      'allowed', false,
      'reason', 'minute_limit',
      'tier', case when v_is_pro then 'pro' else 'free' end,
      'daily_unit_limit', v_daily_unit_limit,
      'retry_after_seconds', coalesce(v_retry_seconds, 60),
      'minute_remaining', 0,
      'daily_units_remaining', greatest(0, v_daily_unit_limit - v_daily_units)
    );
  end if;

  if v_daily_units + p_units > v_daily_unit_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit',
      'tier', case when v_is_pro then 'pro' else 'free' end,
      'daily_unit_limit', v_daily_unit_limit,
      'retry_after_seconds', 3600,
      'minute_remaining', greatest(0, v_minute_limit - v_minute_requests),
      'daily_units_remaining', greatest(0, v_daily_unit_limit - v_daily_units)
    );
  end if;

  insert into public.ai_usage_events (user_id, endpoint, units, occurred_at)
    values (v_user_id, p_endpoint, p_units, v_now);

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'tier', case when v_is_pro then 'pro' else 'free' end,
    'daily_unit_limit', v_daily_unit_limit,
    'minute_remaining', greatest(0, v_minute_limit - v_minute_requests - 1),
    'daily_units_remaining', greatest(0, v_daily_unit_limit - v_daily_units - p_units)
  );
end;
$$;

-- PostgREST upsert target used by persistLearnerErrors(): a real unique
-- constraint (the partial index above is not sufficient for ON CONFLICT).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.error_review_cards'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid='public.error_review_cards'::regclass and attname='user_id'),
        (select attnum from pg_attribute where attrelid='public.error_review_cards'::regclass and attname='category'),
        (select attnum from pg_attribute where attrelid='public.error_review_cards'::regclass and attname='normalized_key')
      ]::smallint[]
  ) then
    alter table public.error_review_cards
      add constraint error_review_cards_user_cat_norm_key
      unique (user_id, category, normalized_key);
  end if;
end $$;
