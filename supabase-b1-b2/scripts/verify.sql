-- Integrity checks for the English B1 → B2 project.
-- Read-only. Raises an exception on the first failed check.
--   psql "$SUPABASE_B1B2_DB_URL" -f supabase-b1-b2/scripts/verify.sql

do $$
declare
  failures text[] := '{}';
  v int;
  t text;
begin
  -- Content volume ---------------------------------------------------------
  select count(*) into v from public.courses;
  if v <> 1 then failures := failures || format('expected 1 course, found %s', v); end if;

  select count(*) into v from public.modules;
  if v <> 8 then failures := failures || format('expected 8 modules, found %s', v); end if;

  select count(*) into v from public.lessons;
  if v <> 64 then failures := failures || format('expected 64 lessons, found %s', v); end if;

  select count(*) into v from public.lesson_blocks;
  if v <> 320 then failures := failures || format('expected 320 blocks, found %s', v); end if;

  select count(*) into v
  from generate_series(1, 64) n
  where not exists (select 1 from public.lessons l where l.lesson_number = n);
  if v > 0 then failures := failures || format('%s lesson numbers missing from 1..64', v); end if;

  -- Per-lesson requirements from the architecture PDF ----------------------
  select count(*) into v from public.lessons l
  where (select count(*) from public.lesson_blocks b where b.lesson_id = l.id) <> 5;
  if v > 0 then failures := failures || format('%s lessons do not have exactly 5 blocks', v); end if;

  select count(*) into v from public.lessons l
  where (select count(*) from public.practice_items p where p.lesson_id = l.id) < 8;
  if v > 0 then failures := failures || format('%s lessons have fewer than 8 practice items', v); end if;

  select count(*) into v from public.lessons l
  where (select count(*) from public.lesson_vocab lv where lv.lesson_id = l.id) < 8;
  if v > 0 then failures := failures || format('%s lessons have fewer than 8 vocabulary items', v); end if;

  select count(*) into v from public.lessons
  where objective = '' or can_do = '' or title = '';
  if v > 0 then failures := failures || format('%s lessons are missing objective/can-do/title', v); end if;

  select count(*) into v from public.practice_items
  where options is null or jsonb_array_length(options) < 3;
  if v > 0 then failures := failures || format('%s practice items have fewer than 3 options', v); end if;

  select count(*) into v from public.practice_items
  where answer is null or answer = '' or not (options ? answer);
  if v > 0 then failures := failures || format('%s practice items have an answer that is not among the options', v); end if;

  -- Per-module requirements ------------------------------------------------
  select count(*) into v from public.modules m
  where (select count(*) from public.speaking_tasks st where st.module_id = m.id) < 3;
  if v > 0 then failures := failures || format('%s modules have fewer than 3 speaking tasks', v); end if;

  select count(*) into v from public.modules m
  where (select count(*) from public.content_inputs ci where ci.module_id = m.id) < 2;
  if v > 0 then failures := failures || format('%s modules have fewer than 2 inputs', v); end if;

  select count(*) into v from public.modules m
  where (select count(*) from public.writing_tasks wt where wt.module_id = m.id) < 1;
  if v > 0 then failures := failures || format('%s modules have no writing task', v); end if;

  select count(*) into v from public.modules where array_length(grammar_focus, 1) is null;
  if v > 0 then failures := failures || format('%s modules have no grammar focus', v); end if;

  select count(*) into v from public.checkpoints;
  if v <> 4 then failures := failures || format('expected 4 checkpoints, found %s', v); end if;

  select count(*) into v from public.badges;
  if v <> 5 then failures := failures || format('expected 5 badges, found %s', v); end if;

  -- Security ---------------------------------------------------------------
  select count(*) into v from pg_tables
  where schemaname = 'public' and not rowsecurity;
  if v > 0 then failures := failures || format('%s public tables have RLS disabled', v); end if;

  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      failures := failures || format('table public.%s has no policies', t);
    end if;
  end loop;

  if not exists (select 1 from storage.buckets where id = 'speaking-recordings' and public = false) then
    failures := failures || 'private speaking-recordings bucket is missing';
  end if;

  -- Report ----------------------------------------------------------------
  if array_length(failures, 1) > 0 then
    raise exception 'Verification failed:%s', E'\n - ' || array_to_string(failures, E'\n - ');
  end if;

  raise notice 'All curriculum and security checks passed.';
end;
$$;

select jsonb_build_object(
  'modules', (select count(*) from public.modules),
  'lessons', (select count(*) from public.lessons),
  'lesson_blocks', (select count(*) from public.lesson_blocks),
  'practice_items', (select count(*) from public.practice_items),
  'vocab_items', (select count(*) from public.vocab_items),
  'lesson_vocab', (select count(*) from public.lesson_vocab),
  'content_inputs', (select count(*) from public.content_inputs),
  'speaking_tasks', (select count(*) from public.speaking_tasks),
  'writing_tasks', (select count(*) from public.writing_tasks),
  'checkpoints', (select count(*) from public.checkpoints),
  'badges', (select count(*) from public.badges),
  'public_tables_with_rls', (select count(*) from pg_tables where schemaname = 'public' and rowsecurity),
  'policies', (select count(*) from pg_policies where schemaname in ('public', 'storage'))
) as verified;
