-- ============================================================================
-- Migration 0013: Fix timestamp column names in consume_ai_usage (occurred_at),
-- cleanup_expired_retention_data (occurred_at + last_hit_at), and
-- delete_my_learning_data (last_hit_at).
-- ============================================================================

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
