create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  type text not null check (type in ('broken','unclear','feedback','idea')),
  status text not null default 'New' check (status in ('New','Investigating','Fixed','Won''t fix')),
  message text not null check (length(message) between 1 and 4000),
  page_url text not null,
  browser text not null default '',
  device text not null default '',
  screen_size text not null default '',
  current_week smallint check (current_week between 1 and 32),
  app_version text not null default 'unknown',
  last_answer text,
  audio_path text,
  screenshot_path text,
  email_sent_at timestamptz
);
create index if not exists issue_reports_created_idx on public.issue_reports (created_at desc);
alter table public.issue_reports enable row level security;
revoke all on public.issue_reports from public, anon, authenticated;
grant select on public.issue_reports to authenticated;
grant insert (user_id, type, message, page_url, browser, device, screen_size, current_week, app_version, last_answer, audio_path, screenshot_path) on public.issue_reports to authenticated;
grant update (status) on public.issue_reports to authenticated;
grant all on public.issue_reports to service_role;
drop policy if exists "issues own insert" on public.issue_reports;
create policy "issues own insert" on public.issue_reports for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "issues own or staff read" on public.issue_reports;
create policy "issues own or staff read" on public.issue_reports for select to authenticated using (auth.uid() = user_id or public.is_staff());
drop policy if exists "issues staff update" on public.issue_reports;
create policy "issues staff update" on public.issue_reports for update to authenticated using (public.is_staff()) with check (public.is_staff());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('issue-attachments', 'issue-attachments', false, 4000000, array['audio/wav','image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "issue attachments own or staff read" on storage.objects;
create policy "issue attachments own or staff read" on storage.objects for select to authenticated
using (bucket_id = 'issue-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

-- A separate abuse limit, not charged against study units.
create table if not exists public.issue_report_attempts (user_id uuid not null references auth.users(id) on delete cascade, attempted_at timestamptz not null default now());
create index if not exists issue_report_attempts_user_time on public.issue_report_attempts(user_id, attempted_at);
alter table public.issue_report_attempts enable row level security;
revoke all on public.issue_report_attempts from public, anon, authenticated;
create or replace function public.reserve_issue_report() returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':issues', 0));
  delete from public.issue_report_attempts where user_id = v_uid and attempted_at < now() - interval '1 hour';
  if (select count(*) from public.issue_report_attempts where user_id = v_uid) >= 5 then return false; end if;
  insert into public.issue_report_attempts(user_id) values (v_uid);
  return true;
end $$;
revoke all on function public.reserve_issue_report() from public, anon;
grant execute on function public.reserve_issue_report() to authenticated;

-- Include issue records and rate-limit records in account data deletion.
do $$
declare definition text; anchor text := 'delete from public.week_input_submissions where user_id = v_uid;';
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position('public.issue_reports' in definition) = 0 then
    if position(anchor in definition) = 0 then raise exception 'Deletion RPC anchor missing'; end if;
    definition := replace(definition, anchor, 'delete from public.issue_reports where user_id = v_uid;' || chr(10) || '  delete from public.issue_report_attempts where user_id = v_uid;' || chr(10) || '  ' || anchor);
    execute definition;
  end if;
end $$;

-- Staff access depends on a trusted role. Prevent self-promotion on profile insert.
create or replace function public.protect_profile_role() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and ((tg_op = 'INSERT' and new.role <> 'learner') or (tg_op = 'UPDATE' and new.role is distinct from old.role)) then
    raise exception 'Role cannot be changed directly';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before insert or update on public.profiles for each row execute function public.protect_profile_role();
