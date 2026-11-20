-- ============================================================================
-- Migration 0008: Feedback loop (learner_errors), FSRS + error review cards,
-- content audio_url + placement_questions, ai_evaluation_cache, tiered quotas.
-- ============================================================================

-- 1. Normalized learner_errors table -----------------------------------------
do $$
begin
  create type error_category as enum (
    'article', 'preposition', 'tense', 'collocation', 'word_order', 'connector'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type error_severity as enum ('minor', 'moderate', 'major');
exception when duplicate_object then null;
end $$;

create table if not exists public.learner_errors (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  source_type  text not null check (source_type in ('writing', 'speaking', 'checkpoint_writing', 'checkpoint_speaking')),
  source_id    uuid,
  lesson_id    uuid references public.lessons(id) on delete set null,
  category     error_category not null,
  original     text not null,
  corrected    text not null,
  explanation  text not null,
  severity     error_severity not null default 'moderate',
  created_at   timestamptz not null default now()
);

create index if not exists learner_errors_user_cat_idx
  on public.learner_errors (user_id, category, created_at desc);

alter table public.learner_errors enable row level security;

drop policy if exists "own errors select" on public.learner_errors;
create policy "own errors select" on public.learner_errors
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own errors insert" on public.learner_errors;
create policy "own errors insert" on public.learner_errors
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own errors delete" on public.learner_errors;
create policy "own errors delete" on public.learner_errors
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.learner_errors to authenticated;

-- 2. FSRS fields on vocab_cards + error_review_cards -------------------------
alter table public.vocab_cards
  add column if not exists stability      numeric(10,4) not null default 0,
  add column if not exists difficulty     numeric(6,4)  not null default 5.0,
  add column if not exists fsrs_state     smallint      not null default 0,
  add column if not exists learning_steps smallint      not null default 0,
  add column if not exists last_review_at timestamptz;

create table if not exists public.error_review_cards (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  learner_error_id   uuid references public.learner_errors(id) on delete set null,
  category           error_category not null,
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
  unique (user_id, category, prompt_sentence)
);

create index if not exists error_review_cards_due_idx
  on public.error_review_cards (user_id, due_at)
  where not suspended;

alter table public.error_review_cards enable row level security;

drop policy if exists "own error cards select" on public.error_review_cards;
create policy "own error cards select" on public.error_review_cards
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own error cards insert" on public.error_review_cards;
create policy "own error cards insert" on public.error_review_cards
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own error cards update" on public.error_review_cards;
create policy "own error cards update" on public.error_review_cards
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own error cards delete" on public.error_review_cards;
create policy "own error cards delete" on public.error_review_cards
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.error_review_cards to authenticated;

drop trigger if exists error_review_cards_touch on public.error_review_cards;
create trigger error_review_cards_touch before update on public.error_review_cards
  for each row execute function public.touch_updated_at();

-- True SM-2 ease-driven fallback inside review_vocab_card RPC
create or replace function public.review_vocab_card(
  p_card_id uuid,
  p_grade   review_grade
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_card      public.vocab_cards;
  v_step      smallint;
  v_interval  int;
  v_ease      numeric(3,2);
  v_lapses    int;
  v_reps      int;
  v_due       timestamptz;
  v_points    int;
begin
  select * into v_card from public.vocab_cards where id = p_card_id and user_id = auth.uid();
  if not found then
    raise exception 'Card not found' using errcode = 'no_data_found';
  end if;

  v_step   := v_card.ladder_step;
  v_ease   := v_card.ease;
  v_lapses := v_card.lapses;
  v_reps   := v_card.reps;

  case p_grade
    when 'again' then
      v_step := 0;
      v_interval := 1;
      v_ease := greatest(1.30, v_ease - 0.20);
      v_lapses := v_lapses + 1;
      v_reps := 0;
      v_points := 0;
    when 'hard' then
      v_ease := greatest(1.30, v_ease - 0.15);
      v_interval := greatest(1, round(greatest(1, v_card.interval_days) * 1.2)::int);
      v_reps := v_reps + 1;
      v_points := 1;
    when 'good' then
      v_reps := v_reps + 1;
      if v_reps = 1 then
        v_interval := 1;
      elsif v_reps = 2 then
        v_interval := 6;
      else
        v_interval := greatest(6, round(greatest(1, v_card.interval_days) * v_ease)::int);
      end if;
      v_step := least(5, v_step + 1);
      v_points := 2;
    when 'easy' then
      v_ease := least(3.50, v_ease + 0.15);
      v_reps := v_reps + 1;
      if v_reps = 1 then
        v_interval := 4;
      else
        v_interval := greatest(4, round(greatest(1, v_card.interval_days) * v_ease * 1.3)::int);
      end if;
      v_step := least(5, v_step + 2);
      v_points := 3;
  end case;

  v_due := now() + make_interval(days => v_interval);

  update public.vocab_cards
     set ladder_step = v_step,
         interval_days = v_interval,
         ease = v_ease,
         lapses = v_lapses,
         reps = v_reps,
         due_at = v_due,
         last_review_at = now(),
         updated_at = now()
   where id = v_card.id;

  insert into public.vocab_reviews (user_id, card_id, vocab_item_id, grade, interval_days, due_at)
  values (v_card.user_id, v_card.id, v_card.vocab_item_id, p_grade, v_interval, v_due);

  if v_points > 0 then
    perform public.award_xp(v_card.user_id, 'vocab_review', v_points, 'vocab_item', v_card.vocab_item_id,
      format('Reviewed: %s', p_grade));
  end if;

  perform public.record_activity(v_card.user_id);

  return jsonb_build_object(
    'card_id', v_card.id,
    'grade', p_grade,
    'ladder_step', v_step,
    'interval_days', v_interval,
    'due_at', v_due,
    'xp', v_points
  );
end;
$$;

-- Server-computed FSRS persistence RPC (uses ts-fsrs outputs, enforces auth + awards XP)
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

revoke all on function public.apply_fsrs_review(text, uuid, review_grade, timestamptz, int, numeric, numeric, smallint, smallint, int, int) from public, anon;
grant execute on function public.apply_fsrs_review(text, uuid, review_grade, timestamptz, int, numeric, numeric, smallint, smallint, int, int) to authenticated;

-- 3. Content audio_url + placement_questions + course-audio bucket ------------
alter table public.content_inputs
  add column if not exists audio_url text;

alter table public.vocab_items
  add column if not exists audio_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-audio',
  'course-audio',
  true,
  26214400,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm']
)
on conflict (id) do nothing;

drop policy if exists "public read course audio" on storage.objects;
create policy "public read course audio" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'course-audio');

-- Recreate get_due_cards to include audio_url + FSRS metadata
drop function if exists public.get_due_cards(int);
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

grant execute on function public.get_due_cards(int) to authenticated;

-- Placement questions as data
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

alter table public.placement_questions enable row level security;

drop policy if exists "public read placement questions" on public.placement_questions;
create policy "public read placement questions" on public.placement_questions
  for select to anon, authenticated using (active);

grant select on public.placement_questions to anon, authenticated;

insert into public.placement_questions (sort_order, area, question, options, answer_index) values
(1, 'Present perfect vs. past simple',
 'Choose the sentence that correctly describes life experience without a finished time:',
 '["I visited three European capitals since 2022.", "I have visited Lisbon three times, and I loved it.", "I was visiting Lisbon three times in my life.", "I have started my first job in 2019."]'::jsonb,
 1),
(2, 'Narrative tenses',
 'When I arrived at the station, the train ___ ten minutes earlier.',
 '["already left", "was already leaving", "had already left", "has already left"]'::jsonb,
 2),
(3, 'Future forms & conditionals',
 'Which sentence expresses diplomatic advice in a second conditional?',
 '["If I am you, I will negotiate the contract.", "If I were you, I would negotiate the terms before signing.", "If I had been you, I negotiate the salary.", "If I will be you, I would ask for a raise."]'::jsonb,
 1),
(4, 'Modals of deduction',
 'The site is down on every device — they ___ be updating the servers right now.',
 '["must", "can''t", "should", "would"]'::jsonb,
 0),
(5, 'Concession linkers',
 '___ the criticism from local businesses, the council kept the pedestrian zone.',
 '["Whereas", "Consequently", "In spite of", "Nevertheless"]'::jsonb,
 2),
(6, 'Inversion & hedging',
 'Choose the most accurate B2 inverted sentence for emphasis:',
 '["Not only the policy cut emissions, but it also saved money.", "Not only did the policy cut emissions, but it also created jobs.", "Rarely I have seen such a compelling argument.", "Never the city has faced a decision like this."]'::jsonb,
 1)
on conflict (sort_order) do nothing;

-- 4. AI evaluation cache + subscription-tiered rate limits --------------------
create table if not exists public.ai_evaluation_cache (
  cache_key   text primary key,
  endpoint    text not null,
  model       text not null,
  response    jsonb not null,
  hit_count   int not null default 0,
  created_at  timestamptz not null default now(),
  last_hit_at timestamptz not null default now()
);

alter table public.ai_evaluation_cache enable row level security;

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

revoke all on function public.get_ai_eval_cache(text) from public, anon;
grant execute on function public.get_ai_eval_cache(text) to authenticated;

revoke all on function public.set_ai_eval_cache(text, text, text, jsonb) from public, anon;
grant execute on function public.set_ai_eval_cache(text, text, text, jsonb) to authenticated;

-- Upgrade consume_ai_usage with Stripe subscription tier gating
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
    '/api/checkpoints/evaluate', '/api/checkpoints/writing', '/api/lessons/generate'
  ) or p_units < 1 or p_units > 10 then
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
