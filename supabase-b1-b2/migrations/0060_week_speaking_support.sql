-- Week 1–4 speaking support: preserve planning, server-marked listening,
-- phrase selections and both evaluated recordings as one learner-owned attempt.
create table if not exists public.week_speaking_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 4),
  notes jsonb not null default '[]'::jsonb check (jsonb_typeof(notes) = 'array'),
  focus_choice smallint check (focus_choice between 0 and 2),
  focus_correct boolean,
  notice_selected jsonb check (notice_selected is null or jsonb_typeof(notice_selected) = 'array'),
  first_recording_path text,
  first_transcript text,
  first_feedback jsonb,
  second_recording_path text,
  second_transcript text,
  second_feedback jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (second_recording_path is null or first_recording_path is not null)
);

create index if not exists week_speaking_attempts_owner_week_created
  on public.week_speaking_attempts (user_id, week_number, created_at desc);

alter table public.week_speaking_attempts enable row level security;
revoke all on public.week_speaking_attempts from public, anon, authenticated;
grant select on public.week_speaking_attempts to authenticated;
grant all on public.week_speaking_attempts to service_role;
drop policy if exists "read own week speaking attempts" on public.week_speaking_attempts;
create policy "read own week speaking attempts" on public.week_speaking_attempts
  for select to authenticated using (user_id = auth.uid());
drop trigger if exists week_speaking_attempts_touch on public.week_speaking_attempts;
create trigger week_speaking_attempts_touch before update on public.week_speaking_attempts
  for each row execute function public.touch_updated_at();

-- Include the new private audio object paths in the existing delete-data RPC,
-- and remove this learner's attempt row. Insert at function scope, immediately
-- before the return, so it works with both replay and the guarded live body.
do $$
declare
  definition text;
  anchor text := 'return jsonb_build_object(';
  branch text := $branch$
  if to_regclass('public.week_speaking_attempts') is not null then
    select coalesce(v_audio_paths, '{}'::text[]) || coalesce(
      array_agg(recording_path) filter (where recording_path is not null and recording_path <> ''),
      '{}'::text[]
    ) into v_audio_paths
    from public.week_speaking_attempts,
      lateral unnest(array[first_recording_path, second_recording_path]) as paths(recording_path)
    where user_id = v_uid;
    execute 'delete from public.week_speaking_attempts where user_id = $1' using v_uid;
  end if;
$branch$;
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position(anchor in definition) = 0 then
    raise exception 'Deletion RPC return anchor missing';
  end if;
  if position('public.week_speaking_attempts' in definition) = 0 then
    definition := replace(definition, anchor, branch || chr(10) || '  ' || anchor);
    execute definition;
  end if;
end $$;

do $$
begin
  if position('public.week_speaking_attempts' in pg_get_functiondef('public.delete_my_learning_data()'::regprocedure)) = 0 then
    raise exception 'delete_my_learning_data() does not clear week_speaking_attempts';
  end if;
end $$;

notify pgrst, 'reload schema';
