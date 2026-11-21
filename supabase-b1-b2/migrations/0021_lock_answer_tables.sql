-- ============================================================================
-- Lock answer-bearing curriculum tables and expose answer-free safe views.
-- Idempotent: each block runs only when its base table exists, so the same
-- migration can be applied to both the app project and the B1-B2 project.
-- ============================================================================

do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles add column if not exists role text not null default 'learner';
    if not exists (
      select 1 from pg_constraint
      where conname = 'profiles_role_check' and conrelid = 'public.profiles'::regclass
    ) then
      alter table public.profiles add constraint profiles_role_check
        check (role in ('learner', 'teacher', 'admin'));
    end if;
  end if;
end $$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('teacher', 'admin')
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated;

-- Recursively removes answer-bearing fields from JSON payloads.
create or replace function public.strip_answer_fields(value jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when jsonb_typeof(value) = 'object' then (
      select jsonb_object_agg(entry.key, public.strip_answer_fields(entry.value))
      from jsonb_each(value) as entry(key, value)
      where entry.key not in ('key', 'accepted', 'reason', 'model', 'modelAnswer', 'answer_index')
    )
    when jsonb_typeof(value) = 'array' then (
      select jsonb_agg(public.strip_answer_fields(item.value))
      from jsonb_array_elements(value) as item(value)
    )
    else value
  end;
$$;

revoke all on function public.strip_answer_fields(jsonb) from public;
grant execute on function public.strip_answer_fields(jsonb) to authenticated;

do $$
declare
  target_table text;
  policy_row record;
begin
  foreach target_table in array array[
    'syllabus_checkpoint_items',
    'syllabus_grammar_items',
    'syllabus_input_items',
    'syllabus_week_details',
    'syllabus_assessments',
    'placement_questions'
  ]
  loop
    if to_regclass('public.' || target_table) is null then
      continue;
    end if;

    for policy_row in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = target_table and cmd = 'SELECT'
    loop
      execute format('drop policy %I on public.%I', policy_row.policyname, target_table);
    end loop;

    execute format('revoke select on public.%I from anon', target_table);
    execute format('grant select on public.%I to authenticated', target_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_staff())',
      target_table || '_staff_read', target_table
    );
  end loop;
end $$;

-- Safe, answer-free projections. Views are owned by postgres and do not use the
-- caller's RLS, so authenticated learners can read questions without keys.
do $$
begin
  if to_regclass('public.placement_questions') is not null then
    drop view if exists public.placement_questions_safe;
    execute $sql$
      create view public.placement_questions_safe as
      select id, sort_order, area, question, options
      from public.placement_questions
      where active = true
    $sql$;
    grant select on public.placement_questions_safe to anon, authenticated;
  end if;

  if to_regclass('public.syllabus_checkpoint_items') is not null then
    drop view if exists public.syllabus_checkpoint_items_safe;
    execute $sql$
      create view public.syllabus_checkpoint_items_safe as
      select id, week_number, target, prompt, options, sort_order
      from public.syllabus_checkpoint_items
      where reserve = false
    $sql$;
    grant select on public.syllabus_checkpoint_items_safe to authenticated;
  end if;

  if to_regclass('public.syllabus_grammar_items') is not null then
    drop view if exists public.syllabus_grammar_items_safe;
    execute $sql$
      create view public.syllabus_grammar_items_safe as
      select id, week_number, step, target, public.strip_answer_fields(payload) as payload, sort_order
      from public.syllabus_grammar_items
    $sql$;
    grant select on public.syllabus_grammar_items_safe to authenticated;
  end if;

  if to_regclass('public.syllabus_input_items') is not null then
    drop view if exists public.syllabus_input_items_safe;
    execute $sql$
      create view public.syllabus_input_items_safe as
      select id, week_number, mode, step, public.strip_answer_fields(payload) as payload, sort_order
      from public.syllabus_input_items
    $sql$;
    grant select on public.syllabus_input_items_safe to authenticated;
  end if;

  if to_regclass('public.syllabus_week_details') is not null then
    drop view if exists public.syllabus_week_details_safe;
    execute $sql$
      create view public.syllabus_week_details_safe as
      select week_number, public.strip_answer_fields(payload) as payload
      from public.syllabus_week_details
    $sql$;
    grant select on public.syllabus_week_details_safe to authenticated;
  end if;

  if to_regclass('public.syllabus_assessments') is not null then
    drop view if exists public.syllabus_assessments_safe;
    execute $sql$
      create view public.syllabus_assessments_safe as
      select code, title, public.strip_answer_fields(payload) as payload
      from public.syllabus_assessments
    $sql$;
    grant select on public.syllabus_assessments_safe to authenticated;
  end if;
end $$;

-- Vocabulary has no answer data; keep it public for learner cards.
do $$ begin if to_regclass('public.syllabus_vocab_items') is not null then grant select on public.syllabus_vocab_items to anon, authenticated; end if; end $$;
