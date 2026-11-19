-- Atomic authenticated AI usage metering and rolling-window limits.
create table if not exists public.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  units smallint not null check (units between 1 and 10),
  occurred_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_time_idx
  on public.ai_usage_events (user_id, occurred_at desc);

alter table public.ai_usage_events enable row level security;
-- No direct table policies: clients can only consume quota via the authenticated RPC.

create or replace function public.consume_ai_usage(p_endpoint text, p_units integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_minute_requests integer;
  v_daily_units integer;
  v_minute_limit constant integer := 5;
  v_daily_unit_limit constant integer := 60;
  v_retry_seconds integer;
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

  -- Serialize requests per user so parallel calls cannot bypass either limit.
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
      'allowed', false, 'reason', 'minute_limit', 'retry_after_seconds', coalesce(v_retry_seconds, 60),
      'minute_remaining', 0, 'daily_units_remaining', greatest(0, v_daily_unit_limit - v_daily_units)
    );
  end if;

  if v_daily_units + p_units > v_daily_unit_limit then
    return jsonb_build_object(
      'allowed', false, 'reason', 'daily_limit', 'retry_after_seconds', 3600,
      'minute_remaining', greatest(0, v_minute_limit - v_minute_requests), 'daily_units_remaining', greatest(0, v_daily_unit_limit - v_daily_units)
    );
  end if;

  insert into public.ai_usage_events (user_id, endpoint, units, occurred_at)
    values (v_user_id, p_endpoint, p_units, v_now);

  return jsonb_build_object(
    'allowed', true, 'reason', null,
    'minute_remaining', greatest(0, v_minute_limit - v_minute_requests - 1),
    'daily_units_remaining', greatest(0, v_daily_unit_limit - v_daily_units - p_units)
  );
end;
$$;

revoke all on function public.consume_ai_usage(text, integer) from public, anon;
grant execute on function public.consume_ai_usage(text, integer) to authenticated;
