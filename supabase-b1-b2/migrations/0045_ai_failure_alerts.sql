-- ============================================================================
-- Migration 0045: group AI provider failure alerts.
--
-- A bad key or an exhausted daily quota fails every request from every learner.
-- The application emails the operator once per failure kind per endpoint, then
-- this table suppresses further mail for the same incident inside a window.
--
-- Grouping is by a SHA-256 of "<endpoint>|<kind>", so the table never stores a
-- path in the clear and an alert for /api/writing/correct does not silence an
-- alert for /api/speaking/evaluate.
--
-- `claim_ai_failure_alert` is the gate the application calls before sending:
--   true  -> no alert in the window; take the slot and send
--   false -> already alerted recently; stay quiet
-- It is written to be safe under concurrent serverless invocations: the row is
-- locked before the decision, so two requests cannot both claim the same slot.
-- ============================================================================

create table if not exists public.ai_failure_alerts (
  group_key text primary key check (group_key ~ '^[0-9a-f]{64}$'),
  kind text not null,
  last_sent_at timestamptz not null default now()
);

alter table public.ai_failure_alerts enable row level security;
-- Service role only: this is operational state, not learner data.
revoke all on public.ai_failure_alerts from public, anon, authenticated;
grant all on public.ai_failure_alerts to service_role;

create or replace function public.claim_ai_failure_alert(p_group_key text, p_window_minutes integer default 10)
returns boolean language plpgsql security definer set search_path = public as $$
declare last_sent timestamptz;
begin
  if p_group_key !~ '^[0-9a-f]{64}$' then raise exception 'Invalid alert key'; end if;
  if p_window_minutes is null or p_window_minutes < 1 or p_window_minutes > 1440 then
    raise exception 'Invalid alert window';
  end if;

  -- Create the row on first sight so it can be locked below. Concurrent callers
  -- all pass through this insert; only one then wins the lock.
  insert into public.ai_failure_alerts (group_key, kind, last_sent_at)
  values (p_group_key, 'pending', to_timestamp(0))
  on conflict (group_key) do nothing;

  select last_sent_at into last_sent from public.ai_failure_alerts
  where group_key = p_group_key for update;

  if last_sent is not null and last_sent > now() - make_interval(mins => p_window_minutes) then
    return false;
  end if;

  update public.ai_failure_alerts
  set last_sent_at = now(), kind = coalesce(nullif(kind, 'pending'), kind)
  where group_key = p_group_key;
  return true;
end $$;

revoke all on function public.claim_ai_failure_alert(text, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_failure_alert(text, integer) to service_role;
