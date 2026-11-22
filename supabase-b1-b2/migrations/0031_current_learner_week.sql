-- The published rule requires speaking, writing and either reading or listening.
alter table public.profiles add column if not exists current_week smallint not null default 1 check (current_week between 1 and 32);

create table if not exists public.week_input_submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 32),
  skill text not null check (skill in ('reading', 'listening')),
  submitted_at timestamptz not null default now(),
  primary key (user_id, week_number, skill)
);
alter table public.week_input_submissions enable row level security;
revoke all on public.week_input_submissions from anon, authenticated;
grant select on public.week_input_submissions to authenticated;
grant all on public.week_input_submissions to service_role;
drop policy if exists "read own week input submissions" on public.week_input_submissions;
create policy "read own week input submissions" on public.week_input_submissions for select to authenticated using (auth.uid() = user_id);

-- Direct profile edits must not let a learner set the computed value.
create or replace function public.protect_current_week() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and ((tg_op = 'INSERT' and new.current_week <> 1) or (tg_op = 'UPDATE' and new.current_week is distinct from old.current_week)) then
    raise exception 'current_week is calculated from progress';
  end if;
  return new;
end $$;
drop trigger if exists protect_current_week on public.profiles;
create trigger protect_current_week before insert or update on public.profiles for each row execute function public.protect_current_week();

-- Recompute sequentially, so completing a later week cannot skip missing weeks.
-- A Stage 2 placement starts at Week 17. Lock the profile to serialize refreshes.
create or replace function public.refresh_current_week() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_week integer;
  v_placement jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select placement_result into v_placement from public.profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found'; end if;
  v_week := case when v_placement->>'band' = 'Stage 2' then 17 else 1 end;
  while v_week < 32 loop
    exit when not (
      exists (select 1 from public.week_output_submissions where user_id = v_uid and week_number = v_week and skill = 'speaking')
      and exists (select 1 from public.week_output_submissions where user_id = v_uid and week_number = v_week and skill = 'writing')
      and exists (select 1 from public.week_input_submissions where user_id = v_uid and week_number = v_week and skill in ('reading', 'listening'))
    );
    v_week := v_week + 1;
  end loop;
  update public.profiles set current_week = v_week where id = v_uid and current_week is distinct from v_week;
  return v_week;
end $$;
revoke all on function public.refresh_current_week() from public, anon;
grant execute on function public.refresh_current_week() to authenticated;

-- Keep account deletion atomic and covered by the schema guard.
do $$
declare definition text; anchor text := 'delete from public.week_output_submissions where user_id = v_uid;';
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position('public.week_input_submissions' in definition) = 0 then
    if position(anchor in definition) = 0 then raise exception 'Deletion RPC anchor missing'; end if;
    definition := replace(definition, anchor, 'delete from public.week_input_submissions where user_id = v_uid;' || chr(10) || '  ' || anchor);
  end if;
  if position('current_week' in definition) = 0 then
    if position('onboarding_completed = false,' in definition) = 0 then raise exception 'Profile reset anchor missing'; end if;
    definition := replace(definition, 'onboarding_completed = false,', 'onboarding_completed = false,' || chr(10) || '         current_week = 1,');
  end if;
  execute definition;
end $$;
