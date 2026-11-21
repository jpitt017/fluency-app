-- Persist typed and dictated mediation practice, with learner/staff RLS.
-- Review queue flags are set only by the existing low-confidence, dispute and
-- 1-in-10 spot-check rules; every other attempt is saved without a review flag.

create table if not exists public.mediation_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  week          integer not null check (week between 1 and 32),
  task_key      text not null check (char_length(task_key) between 1 and 120),
  transcript    text check (transcript is null or char_length(transcript) <= 4000),
  response_text text check (response_text is null or char_length(response_text) <= 4000),
  feedback      jsonb not null default '{}'::jsonb,
  needs_review  boolean not null default false,
  review_reason text,
  disputed      boolean not null default false,
  created_at    timestamptz not null default now(),
  check (transcript is not null or response_text is not null)
);

create index if not exists mediation_attempts_user_created_idx
  on public.mediation_attempts (user_id, created_at desc);
create index if not exists mediation_attempts_review_idx
  on public.mediation_attempts (needs_review, created_at desc);

alter table public.mediation_attempts enable row level security;

drop policy if exists "own mediation attempts select" on public.mediation_attempts;
create policy "own mediation attempts select" on public.mediation_attempts
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists "own mediation attempts insert" on public.mediation_attempts;
create policy "own mediation attempts insert" on public.mediation_attempts
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "own mediation attempts update" on public.mediation_attempts;
create policy "own mediation attempts update" on public.mediation_attempts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.mediation_attempts to authenticated;

-- Let mediation corrections use the same error log and review cards as other work.
do $$
declare
  constraint_name text;
begin
  if to_regclass('public.learner_errors') is not null then
    for constraint_name in
      select conname
      from pg_constraint
      where conrelid = 'public.learner_errors'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%source_type%'
    loop
      execute format('alter table public.learner_errors drop constraint %I', constraint_name);
    end loop;

    alter table public.learner_errors
      add constraint learner_errors_source_type_check
      check (source_type in ('writing', 'speaking', 'checkpoint_writing', 'checkpoint_speaking', 'mediation'));
  end if;
end $$;

-- Keep the account-deletion RPC's schema-drift coverage check happy.
do $$
declare
  function_def text;
begin
  if to_regprocedure('public.delete_my_learning_data()') is not null then
    select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into function_def;
    if position('public.mediation_attempts' in function_def) = 0 then
      function_def := replace(
        function_def,
        'delete from public.error_review_cards where user_id = v_uid;',
        'delete from public.mediation_attempts where user_id = v_uid;' || chr(10) ||
        '  delete from public.error_review_cards where user_id = v_uid;'
      );
      execute function_def;
    end if;
  end if;
end $$;
