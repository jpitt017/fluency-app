-- Pilot membership is separate from staff roles and paid subscriptions.
create table if not exists public.pilot_learners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null
);
alter table public.pilot_learners enable row level security;
revoke all on public.pilot_learners from public, anon, authenticated;
grant select on public.pilot_learners to authenticated;
grant all on public.pilot_learners to service_role;
drop policy if exists "staff read pilot learners" on public.pilot_learners;
create policy "staff read pilot learners" on public.pilot_learners for select to authenticated using (public.is_staff());

-- A reset changes the counted window without erasing the usage events.
create table if not exists public.ai_usage_resets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reset_at timestamptz not null default now()
);
alter table public.ai_usage_resets enable row level security;
revoke all on public.ai_usage_resets from public, anon, authenticated;
grant all on public.ai_usage_resets to service_role;

create or replace function public.teacher_set_pilot(p_user_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Teacher access required' using errcode = '42501'; end if;
  if p_enabled is null or not exists (select 1 from public.profiles where id = p_user_id and role = 'learner') then
    raise exception 'Learner not found' using errcode = '22023';
  end if;
  if p_enabled then
    insert into public.pilot_learners(user_id, assigned_by) values (p_user_id, auth.uid())
      on conflict (user_id) do update set assigned_by = excluded.assigned_by, assigned_at = now();
  else
    delete from public.pilot_learners where user_id = p_user_id;
  end if;
end $$;
revoke all on function public.teacher_set_pilot(uuid, boolean) from public, anon;
grant execute on function public.teacher_set_pilot(uuid, boolean) to authenticated;

-- One calendar day in Europe/Madrid, including daylight-saving transitions.
-- The status RPC only reveals the signed-in caller's own usage.
create or replace function public.get_ai_usage_status() returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_user uuid := auth.uid(); v_role text; v_sub text; v_tier text; v_limit integer;
  v_now timestamptz := now(); v_day_start timestamptz; v_reset timestamptz; v_used integer;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select role, subscription_status into v_role, v_sub from public.profiles where id = v_user;
  if not found then raise exception 'profile not found' using errcode = 'P0002'; end if;
  v_tier := case when v_role in ('teacher', 'admin') then 'staff'
    when v_sub in ('active', 'trialing') then 'pro'
    when exists (select 1 from public.pilot_learners where user_id = v_user) then 'pilot'
    else 'free' end;
  v_limit := case v_tier when 'staff' then 1000 when 'pro' then 180 when 'pilot' then 120 else 30 end;
  v_day_start := date_trunc('day', v_now at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  select reset_at into v_reset from public.ai_usage_resets where user_id = v_user;
  select coalesce(sum(units), 0)::integer into v_used from public.ai_usage_events
    where user_id = v_user and occurred_at >= v_day_start and (v_reset is null or occurred_at > v_reset);
  return jsonb_build_object('tier', v_tier, 'daily_unit_limit', v_limit,
    'daily_units_used', v_used, 'daily_units_remaining', greatest(0, v_limit - v_used));
end $$;
revoke all on function public.get_ai_usage_status() from public, anon;
grant execute on function public.get_ai_usage_status() to authenticated;

create or replace function public.consume_ai_usage(p_endpoint text, p_units integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_user uuid := auth.uid(); v_now timestamptz := clock_timestamp(); v_status jsonb;
  v_limit integer; v_used integer; v_minute_limit integer; v_requests integer; v_retry integer;
  v_tomorrow timestamptz;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_endpoint is null or p_endpoint not in (
    '/api/speaking/chat', '/api/speaking/evaluate', '/api/writing/correct',
    '/api/checkpoints/evaluate', '/api/checkpoints/writing', '/api/lessons/generate', '/api/review/check-rewrite'
  ) or p_units is null or p_units < 1 or p_units > 20 then raise exception 'invalid AI usage request' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text), hashtext('ai_usage'));
  v_status := public.get_ai_usage_status();
  v_limit := (v_status->>'daily_unit_limit')::integer;
  v_used := (v_status->>'daily_units_used')::integer;
  v_minute_limit := case v_status->>'tier' when 'staff' then 60 when 'pro' then 12 when 'pilot' then 12 else 5 end;
  delete from public.ai_usage_events where user_id = v_user and occurred_at < v_now - interval '30 days';
  select count(*)::integer into v_requests from public.ai_usage_events where user_id = v_user and occurred_at > v_now - interval '1 minute';
  if v_requests >= v_minute_limit then
    select greatest(1, ceil(extract(epoch from (min(occurred_at) + interval '1 minute' - v_now)))::integer) into v_retry
      from public.ai_usage_events where user_id = v_user and occurred_at > v_now - interval '1 minute';
    return v_status || jsonb_build_object('allowed', false, 'reason', 'minute_limit', 'retry_after_seconds', v_retry, 'minute_remaining', 0);
  end if;
  if v_used + p_units > v_limit then
    v_tomorrow := (date_trunc('day', v_now at time zone 'Europe/Madrid') + interval '1 day') at time zone 'Europe/Madrid';
    return v_status || jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_tomorrow - v_now)))::integer), 'minute_remaining', greatest(0, v_minute_limit - v_requests));
  end if;
  insert into public.ai_usage_events(user_id, endpoint, units, occurred_at) values (v_user, p_endpoint, p_units, v_now);
  return v_status || jsonb_build_object('allowed', true, 'reason', null, 'minute_remaining', greatest(0, v_minute_limit - v_requests - 1),
    'daily_units_used', v_used + p_units, 'daily_units_remaining', greatest(0, v_limit - v_used - p_units));
end $$;
revoke all on function public.consume_ai_usage(text, integer) from public, anon;
grant execute on function public.consume_ai_usage(text, integer) to authenticated;

-- Learning-data deletion also clears membership and the reset marker.
do $$
declare definition text; anchor text := 'delete from public.ai_usage_events where user_id = v_uid;';
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position('public.ai_usage_resets' in definition) = 0 then
    if position(anchor in definition) = 0 then raise exception 'Deletion RPC anchor missing'; end if;
    definition := replace(definition, anchor, anchor || chr(10) || '  delete from public.ai_usage_resets where user_id = v_uid;' || chr(10) || '  delete from public.pilot_learners where user_id = v_uid;');
    execute definition;
  end if;
end $$;
