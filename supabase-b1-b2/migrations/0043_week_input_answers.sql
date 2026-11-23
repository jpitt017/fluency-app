-- Per-question reading and listening attempts.
--
-- Until now a learner could submit a whole reading or listening set and only
-- the completion flag was stored (week_input_submissions). Marking each answer
-- with its reason needs the answer itself, and "Delete my data" must then cover
-- the new rows.
create table if not exists public.week_input_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 4),
  skill text not null check (skill in ('reading', 'listening')),
  item_id text not null check (length(item_id) between 1 and 30),
  answer text not null check (length(answer) between 1 and 500),
  correct boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_number, skill, item_id)
);
create index if not exists week_input_answers_user_week_idx
  on public.week_input_answers(user_id, week_number, created_at desc);

alter table public.week_input_answers enable row level security;
revoke all on public.week_input_answers from public, anon, authenticated;
grant select on public.week_input_answers to authenticated;
grant all on public.week_input_answers to service_role;

drop policy if exists "read own input answers" on public.week_input_answers;
create policy "read own input answers" on public.week_input_answers
  for select to authenticated using (user_id = auth.uid());

drop trigger if exists week_input_answers_touch on public.week_input_answers;
create trigger week_input_answers_touch before update on public.week_input_answers
  for each row execute function public.touch_updated_at();

-- Additive, for the same reason as 0041: read the live function and insert the
-- branch if it is missing, rather than replacing a body another branch may have
-- extended.
do $$
declare
  definition text;
  anchor text := 'delete from public.week_input_submissions where user_id = v_uid;';
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position('public.week_input_answers' in definition) = 0 then
    if position(anchor in definition) = 0 then raise exception 'Deletion RPC anchor missing'; end if;
    definition := replace(
      definition,
      anchor,
      anchor || chr(10) || '  delete from public.week_input_answers where user_id = v_uid;'
    );
    execute definition;
  end if;
end $$;
