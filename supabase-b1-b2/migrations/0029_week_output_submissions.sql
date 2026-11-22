-- One unlock per learner, week and output skill. Only the server may create an unlock.
create table if not exists public.week_output_submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 32),
  skill text not null check (skill in ('speaking', 'writing')),
  submitted_at timestamptz not null default now(),
  primary key (user_id, week_number, skill)
);
alter table public.week_output_submissions enable row level security;
revoke all on public.week_output_submissions from anon, authenticated;
grant select, delete on public.week_output_submissions to authenticated;
grant all on public.week_output_submissions to service_role;
drop policy if exists "read own week output submissions" on public.week_output_submissions;
create policy "read own week output submissions" on public.week_output_submissions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "delete own week output submissions" on public.week_output_submissions;
create policy "delete own week output submissions" on public.week_output_submissions
  for delete to authenticated using (auth.uid() = user_id);
