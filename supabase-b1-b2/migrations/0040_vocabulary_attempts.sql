-- Only trusted server marking can insert results. Learners may read their own.
create table if not exists public.week_vocabulary_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 4),
  item_id text not null check (length(item_id) between 1 and 30),
  answer text not null check (length(answer) between 1 and 500),
  correct boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists week_vocabulary_attempts_user_week_idx on public.week_vocabulary_attempts(user_id, week_number, created_at desc);
alter table public.week_vocabulary_attempts enable row level security;
revoke all on public.week_vocabulary_attempts from public, anon, authenticated;
grant select on public.week_vocabulary_attempts to authenticated;
grant all on public.week_vocabulary_attempts to service_role;
drop policy if exists "read own vocabulary attempts" on public.week_vocabulary_attempts;
create policy "read own vocabulary attempts" on public.week_vocabulary_attempts for select to authenticated using (user_id = auth.uid());

do $$
declare
  definition text;
  anchor_pattern text := 'delete from public\.ai_usage_events where user_id = [^;]*;';
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position('public.week_vocabulary_attempts' in definition) = 0 then
    if definition !~ anchor_pattern then raise exception 'Deletion RPC anchor missing'; end if;
    definition := regexp_replace(definition, anchor_pattern,
      '\&' || chr(10) || '  delete from public.week_vocabulary_attempts where user_id = v_uid;');
    execute definition;
  end if;
end $$;
