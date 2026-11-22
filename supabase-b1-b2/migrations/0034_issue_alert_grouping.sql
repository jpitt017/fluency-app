-- Coordinate per-page alerts across concurrent serverless instances. Grouped
-- reports do not extend the ten-minute window, which starts on an actual send.
alter table public.issue_reports add column if not exists email_grouped boolean not null default false;
alter table public.issue_reports add column if not exists email_page_hash text;
create index if not exists issue_reports_pending_page_idx on public.issue_reports(email_page_hash) where type = 'broken' and email_sent_at is null;
create index if not exists issue_reports_sent_alert_idx on public.issue_reports(email_sent_at) where type = 'broken' and not email_grouped and email_page_hash is null;

create table if not exists public.issue_alert_pages (
  page_hash text primary key,
  last_sent_at timestamptz,
  lease_token uuid,
  lease_until timestamptz
);
alter table public.issue_alert_pages enable row level security;
revoke all on public.issue_alert_pages from public, anon, authenticated;
grant all on public.issue_alert_pages to service_role;

create or replace function public.claim_issue_alert(p_id uuid, p_page_hash text, p_token uuid)
returns text language plpgsql set search_path = public as $$
declare report public.issue_reports%rowtype; alert public.issue_alert_pages%rowtype; legacy_sent timestamptz;
begin
  if p_page_hash !~ '^[0-9a-f]{64}$' or p_token is null then raise exception 'Invalid claim'; end if;
  -- All paths lock page first, then reports, including the finish operation.
  insert into public.issue_alert_pages(page_hash) values (p_page_hash) on conflict do nothing;
  select * into alert from public.issue_alert_pages where page_hash = p_page_hash for update;
  select * into report from public.issue_reports where id = p_id and type = 'broken' for update;
  if not found then return 'missing'; end if;
  if report.email_sent_at is not null then return 'done'; end if;
  update public.issue_reports set email_page_hash = p_page_hash where id = p_id;
  -- Include alerts sent by the old application during the deployment window.
  select max(email_sent_at) into legacy_sent from public.issue_reports
    where type = 'broken' and not email_grouped and email_page_hash is null and email_sent_at >= now() - interval '10 minutes'
      and encode(sha256(convert_to(left(regexp_replace(
        case when page_url ~ '^https?://[^/]+' then
          coalesce(nullif(regexp_replace(split_part(split_part(page_url, '?', 1), '#', 1), '^https?://[^/]+', ''), ''), '/')
        else '(unknown page)' end, E'[\\r\\n]', '', 'g'), 1024), 'UTF8')), 'hex') = p_page_hash;
  if greatest(alert.last_sent_at, legacy_sent) >= now() - interval '10 minutes' then
    if legacy_sent is not null and (alert.last_sent_at is null or legacy_sent > alert.last_sent_at) then
      update public.issue_alert_pages set last_sent_at = legacy_sent where page_hash = p_page_hash;
    end if;
    update public.issue_reports set email_sent_at = now(), email_grouped = true where id = p_id;
    return 'grouped';
  end if;
  if alert.lease_until > now() then return 'pending'; end if;
  update public.issue_alert_pages set lease_token = p_token, lease_until = now() + interval '2 minutes' where page_hash = p_page_hash;
  return 'send';
end $$;

create or replace function public.finish_issue_alert(p_id uuid, p_page_hash text, p_token uuid, p_sent boolean)
returns boolean language plpgsql set search_path = public as $$
declare updated integer;
begin
  -- The page row serializes claims and completion; waiting reports have recorded their hash.
  update public.issue_alert_pages
    set last_sent_at = case when p_sent then now() else last_sent_at end,
        lease_token = null, lease_until = null
    where page_hash = p_page_hash and lease_token = p_token;
  get diagnostics updated = row_count;
  if updated = 0 then return false; end if;
  if p_sent then
    update public.issue_reports set email_sent_at = now(), email_grouped = (id <> p_id)
      where type = 'broken' and email_page_hash = p_page_hash and email_sent_at is null;
  end if;
  return true;
end $$;

revoke all on function public.claim_issue_alert(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.finish_issue_alert(uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_issue_alert(uuid, text, uuid) to service_role;
grant execute on function public.finish_issue_alert(uuid, text, uuid, boolean) to service_role;
