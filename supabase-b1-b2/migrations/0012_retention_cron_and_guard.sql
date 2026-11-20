-- ============================================================================
-- Migration 0012: Allow /api/review/check-rewrite in consume_ai_usage +
-- automated 12-month audio/log retention & 90-day cache TTL cleanup RPC.
-- ============================================================================

-- 1. Include /api/review/check-rewrite in consume_ai_usage ------------------
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

  perform pg_advisory_xact_lock(hashtext('ai_usage:' || v_user_id::text));

  select count(*)::int
    into v_minute_requests
    from public.ai_usage_events
   where user_id = v_user_id
     and created_at >= v_now - interval '1 minute';

  select coalesce(sum(units), 0)::int
    into v_daily_units
    from public.ai_usage_events
   where user_id = v_user_id
     and created_at >= date_trunc('day', v_now);

  if v_minute_requests >= v_minute_limit then
    select greatest(1, ceil(extract(epoch from (min(created_at) + interval '1 minute' - v_now)))::int)
      into v_retry_seconds
      from public.ai_usage_events
     where user_id = v_user_id
       and created_at >= v_now - interval '1 minute';

    return jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limit',
      'retry_after_seconds', coalesce(v_retry_seconds, 10),
      'tier', case when v_is_pro then 'pro' else 'free' end,
      'minute_remaining', 0,
      'daily_units_remaining', greatest(0, v_daily_unit_limit - v_daily_units),
      'daily_unit_limit', v_daily_unit_limit
    );
  end if;

  if v_daily_units + p_units > v_daily_unit_limit then
    select greatest(60, ceil(extract(epoch from (date_trunc('day', v_now) + interval '1 day' - v_now)))::int)
      into v_retry_seconds;

    return jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit',
      'retry_after_seconds', coalesce(v_retry_seconds, 3600),
      'tier', case when v_is_pro then 'pro' else 'free' end,
      'minute_remaining', greatest(0, v_minute_limit - v_minute_requests),
      'daily_units_remaining', greatest(0, v_daily_unit_limit - v_daily_units),
      'daily_unit_limit', v_daily_unit_limit
    );
  end if;

  insert into public.ai_usage_events (user_id, endpoint, units, created_at)
  values (v_user_id, p_endpoint, p_units, v_now);

  return jsonb_build_object(
    'allowed', true,
    'tier', case when v_is_pro then 'pro' else 'free' end,
    'minute_remaining', greatest(0, v_minute_limit - v_minute_requests - 1),
    'daily_units_remaining', greatest(0, v_daily_unit_limit - v_daily_units - p_units),
    'daily_unit_limit', v_daily_unit_limit
  );
end;
$$;

-- 2. Scheduled 12-month log/audio retention & 90-day cache cleanup -----------
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
   where expires_at < now();
  get diagnostics v_cache_deleted = row_count;

  delete from public.ai_request_logs
   where created_at < now() - interval '12 months';
  get diagnostics v_logs_deleted = row_count;

  delete from public.ai_usage_events
   where created_at < now() - interval '12 months';
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

revoke all on function public.cleanup_expired_retention_data() from public, anon, authenticated;
grant execute on function public.cleanup_expired_retention_data() to service_role;

-- 3. Schema drift guard: ensure delete_my_learning_data() covers all user_id tables
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

revoke all on function public.verify_delete_my_learning_data_coverage() from public, anon, authenticated;
grant execute on function public.verify_delete_my_learning_data_coverage() to service_role;
