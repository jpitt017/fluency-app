create table if not exists public.week_grammar_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 4),
  item_id text not null check (length(item_id) between 1 and 30),
  answer jsonb not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists week_grammar_attempts_user_week_idx on public.week_grammar_attempts(user_id, week_number, created_at desc);
alter table public.week_grammar_attempts enable row level security;
revoke all on public.week_grammar_attempts from public, anon, authenticated;
grant select on public.week_grammar_attempts to authenticated;
grant all on public.week_grammar_attempts to service_role;
drop policy if exists "learner or staff read grammar attempts" on public.week_grammar_attempts;
create policy "learner or staff read grammar attempts" on public.week_grammar_attempts for select to authenticated using (user_id = auth.uid() or public.is_staff());

do $$
declare
  definition text;
  -- 0041 may already have wrapped this delete in a to_regclass guard, so anchor
  -- on the table name rather than one exact spelling of the statement.
  anchor_pattern text := 'delete from public\.week_output_submissions where user_id = [^;]*;';
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position('public.week_grammar_attempts' in definition) = 0 then
    if definition !~ anchor_pattern then raise exception 'Deletion RPC anchor missing'; end if;
    definition := regexp_replace(definition, anchor_pattern,
      '\&' || chr(10) || '  delete from public.week_grammar_attempts where user_id = v_uid;');
    execute definition;
  end if;
end $$;
