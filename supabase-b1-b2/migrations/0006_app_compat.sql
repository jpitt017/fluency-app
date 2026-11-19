-- ============================================================================
-- Infrastructure the Next.js app expects, ported from the legacy project.
--
-- Without this migration, pointing the app at this project would:
--   * 503 every AI endpoint (proxy.ts calls consume_ai_usage and fails closed);
--   * silently lose every Stripe webhook (stripe_events and the subscription
--     columns on profiles do not exist — the old project has the same bug, it
--     simply never received a subscription).
-- ============================================================================

-- 1. Billing columns on profiles ---------------------------------------------
alter table public.profiles
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status    text,  -- Stripe's own strings
  add column if not exists current_period_end     timestamptz;

create index if not exists profiles_stripe_sub_idx
  on public.profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Clients may edit their own profile, but must not be able to grant themselves
-- a subscription. Replace the table-wide UPDATE grant with a column list.
revoke update on public.profiles from authenticated;
grant update (
  full_name, avatar_url, daily_word_goal, timezone, onboarding_completed, placement_result
) on public.profiles to authenticated;

-- 2. Stripe webhook idempotency ----------------------------------------------
create table if not exists public.stripe_events (
  id         text primary key,          -- evt_...
  type       text not null,
  created_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;  -- service role only

-- Parity with the legacy project. Current code writes subscriptions onto
-- profiles; this table is here for the next iteration of the webhook.
do $$
begin
  create type public.subscription_status as enum (
    'trialing', 'active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.subscriptions (
  id                   text primary key,
  user_id              uuid not null references auth.users(id) on delete cascade,
  status               public.subscription_status not null,
  price_id             text not null,
  quantity             integer,
  cancel_at_period_end boolean,
  current_period_end   timestamptz not null,
  created_at           timestamptz not null default now()
);
alter table public.subscriptions enable row level security;

drop policy if exists "own subscriptions select" on public.subscriptions;
create policy "own subscriptions select" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

grant select on public.subscriptions to authenticated;

-- 3. Curriculum pace preference ---------------------------------------------
create table if not exists public.curriculum_preferences (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  target_hours_per_week numeric not null default 4,
  updated_at            timestamptz not null default now()
);
alter table public.curriculum_preferences enable row level security;

drop policy if exists "own prefs select" on public.curriculum_preferences;
create policy "own prefs select" on public.curriculum_preferences
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own prefs insert" on public.curriculum_preferences;
create policy "own prefs insert" on public.curriculum_preferences
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own prefs update" on public.curriculum_preferences;
create policy "own prefs update" on public.curriculum_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.curriculum_preferences to authenticated;

create or replace function public.import_curriculum_preference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.curriculum_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_default_prefs on public.profiles;
create trigger profiles_default_prefs
  after insert on public.profiles
  for each row execute function public.import_curriculum_preference();

-- Backfill for anyone who already signed up.
insert into public.curriculum_preferences (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- 4. AI usage guard ----------------------------------------------------------
create table if not exists public.ai_usage_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  units       smallint not null check (units between 1 and 10),
  occurred_at timestamptz not null default now()
);
create index if not exists ai_usage_user_time_idx
  on public.ai_usage_events (user_id, occurred_at desc);
alter table public.ai_usage_events enable row level security;  -- definer RPC only

create or replace function public.consume_ai_usage(p_endpoint text, p_units integer)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
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

  -- Serialize per user so parallel calls cannot bypass either limit.
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
      'minute_remaining', greatest(0, v_minute_limit - v_minute_requests),
      'daily_units_remaining', greatest(0, v_daily_unit_limit - v_daily_units)
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
