-- First model view per learner, week, and output skill. No influence on scoring or unlocks.
create table if not exists public.week_model_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 32),
  skill text not null check (skill in ('speaking', 'writing')),
  model_viewed_at timestamptz not null default now(),
  viewed_before_submission boolean not null,
  primary key (user_id, week_number, skill)
);
alter table public.week_model_views enable row level security;
revoke all on public.week_model_views from public, anon, authenticated;
grant select on public.week_model_views to authenticated;
grant all on public.week_model_views to service_role;
drop policy if exists "learners and staff read model views" on public.week_model_views;
create policy "learners and staff read model views" on public.week_model_views for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- Integrate with the existing data deletion RPC without changing prior migrations.
do $$
declare definition text; anchor text := 'delete from public.week_output_submissions where user_id = v_uid;';
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position('public.week_model_views' in definition) = 0 then
    if position(anchor in definition) = 0 then raise exception 'Deletion RPC anchor missing'; end if;
    definition := replace(definition, anchor, anchor || chr(10) || '  delete from public.week_model_views where user_id = v_uid;');
    execute definition;
  end if;
end $$;
