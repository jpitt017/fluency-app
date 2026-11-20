-- ============================================================================
-- Migration 0010: Widened error taxonomy, deduplicated/masterable error cards,
-- errors-per-100-words telemetry, 24-item placement test, AI observability,
-- and weighted audio/writing usage limits.
-- ============================================================================

-- 1. Widen error_category enum -----------------------------------------------
alter type public.error_category add value if not exists 'subject_verb';
alter type public.error_category add value if not exists 'countable_uncountable';
alter type public.error_category add value if not exists 'modal_verb';
alter type public.error_category add value if not exists 'spelling';
alter type public.error_category add value if not exists 'punctuation';
alter type public.error_category add value if not exists 'word_choice';
alter type public.error_category add value if not exists 'other';

-- 2. Extend learner_errors & error_review_cards ------------------------------
alter table public.learner_errors
  add column if not exists other_label       text,
  add column if not exists source_word_count int;

alter table public.error_review_cards
  add column if not exists normalized_key    text,
  add column if not exists context_sentence  text,
  add column if not exists card_format       text not null default 'fix_sentence',
  add column if not exists occurrence_count  int not null default 1,
  add column if not exists mastered          boolean not null default false,
  add column if not exists mastered_at       timestamptz,
  add column if not exists last_attempt_text text;

update public.error_review_cards
   set normalized_key = regexp_replace(lower(trim(prompt_sentence)), '[^a-z0-9 ]+', '', 'g')
 where normalized_key is null;

create unique index if not exists error_review_cards_user_cat_norm_idx
  on public.error_review_cards (user_id, category, normalized_key)
  where normalized_key is not null;

-- 3. Multi-accent speaker metadata on content_inputs -------------------------
alter table public.content_inputs
  add column if not exists speaker_accents jsonb not null default '[]'::jsonb;

update public.content_inputs
   set speaker_accents = '[
     {"speaker": "LAURA", "accent": "en-GB", "label": "British"},
     {"speaker": "DIEGO", "accent": "en-IE", "label": "Irish"},
     {"speaker": "MARI", "accent": "en-US", "label": "American"}
   ]'::jsonb
 where id = '3b7026c8-e692-4ec3-b449-d097170cfd6b';

-- 4. Weighted AI usage units (1..20) + atomic consume_ai_usage ---------------
alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_units_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_units_check check (units between 1 and 20);

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

-- 5. Mastery reward RPC for unprompted error-card repair ---------------------
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
  v_uid uuid := auth.uid();
  v_cat error_category;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.error_review_cards
     set mastered          = true,
         mastered_at       = now(),
         suspended         = true,
         last_attempt_text = p_attempt_text,
         last_review_at    = now(),
         reps              = reps + 1,
         updated_at        = now()
   where id = p_card_id and user_id = v_uid
  returning category into v_cat;

  if v_cat is null then
    raise exception 'Error review card not found' using errcode = 'no_data_found';
  end if;

  perform public.award_xp(v_uid, 'practice', 5, 'error_review_mastered', p_card_id,
    format('Mastered %s repair unprompted', v_cat));
  perform public.record_activity(v_uid);

  return jsonb_build_object('card_id', p_card_id, 'mastered', true, 'xp', 5);
end;
$$;

revoke all on function public.mark_error_card_mastered(uuid, text) from public, anon;
grant execute on function public.mark_error_card_mastered(uuid, text) to authenticated;

-- 6. AI Observability logging & summary --------------------------------------
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

alter table public.ai_request_logs enable row level security;

drop policy if exists "own ai logs select" on public.ai_request_logs;
create policy "own ai logs select" on public.ai_request_logs
  for select to authenticated using (user_id = auth.uid());

grant select on public.ai_request_logs to authenticated;

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

revoke all on function public.log_ai_request(text, text, smallint, int, boolean, int, int, int, int, numeric, text) from public;
grant execute on function public.log_ai_request(text, text, smallint, int, boolean, int, int, int, int, numeric, text) to anon, authenticated;

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

grant execute on function public.get_ai_observability_summary(int) to authenticated;

-- 7. Expand placement_questions to 24 diagnostic items -----------------------
insert into public.placement_questions (sort_order, area, question, options, answer_index) values
(7, 'Articles & generalisation',
 'Choose the natural sentence when speaking about concepts in general:',
 '["The patience is essential when you learn a language.", "Patience is essential when you learn a language.", "A patience is essential when you learn a language.", "An patience is essential when you learn a language."]'::jsonb,
 1),
(8, 'Countable vs. uncountable nouns',
 'Before I moved to Bristol, my tutor gave me ___ about renting a flat.',
 '["a useful advice", "many useful advices", "some useful advice", "an advice"]'::jsonb,
 2),
(9, 'Dependent prepositions',
 'Our coordinator is directly responsible ___ scheduling the weekly workshops.',
 '["of", "for", "about", "to"]'::jsonb,
 1),
(10, 'Gerund after preposition',
 'It took me almost four months to get used ___ on the left.',
 '["to drive", "driving", "to driving", "for driving"]'::jsonb,
 2),
(11, 'Subject-verb agreement',
 'Neither the team leader nor the designers ___ ready to sign off the final draft yet.',
 '["is", "was", "are", "has been"]'::jsonb,
 2),
(12, 'Subject-verb agreement',
 'The number of remote workers in European cities ___ steadily over the past five years.',
 '["have risen", "has risen", "are rising", "were rising"]'::jsonb,
 1),
(13, 'Present perfect with duration',
 'How long ___ in this neighbourhood before you decided to buy a place?',
 '["do you live", "have you lived", "did you live", "were you living"]'::jsonb,
 1),
(14, 'Third conditional',
 'If they ___ the early train, they would have arrived in time for the opening panel.',
 '["had caught", "caught", "would have caught", "have caught"]'::jsonb,
 0),
(15, 'Past modals of regret',
 'I ___ checked the timetable before leaving home — the ferry was cancelled an hour ago.',
 '["must have", "should have", "can''t have", "would have"]'::jsonb,
 1),
(16, 'Passive voice (academic/news)',
 'A new cycle lane ___ along the riverfront at the moment, so traffic is diverted.',
 '["is building", "is being built", "has built", "was being built"]'::jsonb,
 1),
(17, 'Non-defining relative clauses',
 'My colleague Sam, ___ background is in urban planning, chaired the meeting.',
 '["who", "that", "whose", "which"]'::jsonb,
 2),
(18, 'Reported speech backshift',
 'She explained that she ___ the proposal the following morning.',
 '["will review", "would review", "reviews", "has reviewed"]'::jsonb,
 1),
(19, 'Verb + noun collocations',
 'Before launching the survey, we need to ___ some background research on commuter habits.',
 '["make", "do", "take", "create"]'::jsonb,
 1),
(20, 'Natural collocations',
 'After a long discussion, her parents finally ___ to the idea of her studying abroad.',
 '["came round", "went over", "turned up", "gave out"]'::jsonb,
 0),
(21, 'Indirect question word order',
 'Could you let me know what time ___ tomorrow morning?',
 '["does the workshop start", "starts the workshop", "the workshop starts", "is starting the workshop"]'::jsonb,
 2),
(22, 'Contrastive linkers',
 '___ the initial budget looked tight, the community garden opened ahead of schedule.',
 '["Despite", "Although", "In spite of", "However"]'::jsonb,
 1),
(23, 'Hedging & formal register',
 'Which sentence uses appropriate B2 hedging for a workplace report?',
 '["Remote work obviously destroys every team''s motivation.", "It seems likely that hybrid schedules improve retention for many staff.", "Everybody knows working from home is 100% better.", "Offices will definitely disappear next year."]'::jsonb,
 1),
(24, 'Discourse & inference',
 '"Tourism has revitalised the old harbour; nevertheless, rising rents have pushed out local bakeries." What does the writer imply?',
 '["Tourism has had no economic benefit.", "Local bakeries benefited most from higher rents.", "Economic gains came with an unwelcome social cost.", "The harbour should be closed to visitors."]'::jsonb,
 2)
on conflict (sort_order) do nothing;
