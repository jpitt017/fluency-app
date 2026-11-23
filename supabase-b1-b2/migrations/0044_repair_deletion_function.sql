-- Repair delete_my_learning_data() so a database built from this repo behaves
-- like production.
--
-- Building a fresh database from these migrations showed that the function the
-- repo produces cannot run to completion, while the function live actually runs
-- can. Two independent reasons:
--
--   1. 0011 and 0024 write plain deletes against vocabulary_review_items,
--      cefr_checkpoint_attempts, cefr_objective_progress and progress_logs. No
--      migration creates those tables, so on a fresh database the first one
--      raises 42P01 and the whole call rolls back. Live's function guards each
--      optional delete with to_regclass instead.
--   2. The reset block writes `xp`, but profiles has had `xp_total` since 0002
--      (the bare `xp` column belongs to skill_levels). That update raises 42703.
--
-- It also brings the reset up to what live does. The repo version only clears
-- placement_result, onboarding_completed, streak_days and xp; live additionally
-- clears learner_band, target_band, longest_streak, last_active_on,
-- daily_word_goal and timezone, and restarts current_week at 1. "Delete my
-- data" should leave a learner at the state they started in, so the wider reset
-- is the intended behaviour and the repo copy is the one that is wrong.
--
-- Production is not affected by any of this: live already runs the repaired
-- form. This migration exists so that replay, verify_app_schema() and the
-- learner-data deletion test all run against the same function production does.
do $$
declare
  definition text;
  v_table    text;
  v_pattern  text;
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;

  -- 1. Guard every plain delete. Anything already written as an `execute` is
  --    untouched, because those no longer match this pattern.
  definition := regexp_replace(
    definition,
    'delete from public\.([a-z_]+) where user_id = v_uid;',
    'if to_regclass(''public.\1'') is not null then '
      || 'execute ''delete from public.\1 where user_id = $1'' using v_uid; end if;',
    'g'
  );

  -- 2. The reset block. Replace the whole assignment list when it is still in
  --    0024's shape; otherwise fall back to renaming the single bad column so
  --    an instance that has already fixed xp keeps its own reset.
  v_pattern := 'update public\.profiles\s+set[\s\S]*?where id = v_uid;';
  if definition ~ v_pattern then
    definition := regexp_replace(
      definition,
      v_pattern,
      'update public.profiles' || chr(10) ||
      '     set learner_band         = ''B1_low'',' || chr(10) ||
      '         target_band          = ''B2_solid'',' || chr(10) ||
      '         xp_total             = 0,' || chr(10) ||
      '         streak_days          = 0,' || chr(10) ||
      '         longest_streak       = 0,' || chr(10) ||
      '         last_active_on       = null,' || chr(10) ||
      '         daily_word_goal      = 10,' || chr(10) ||
      '         timezone             = ''Europe/Madrid'',' || chr(10) ||
      '         onboarding_completed = false,' || chr(10) ||
      '         placement_result     = null,' || chr(10) ||
      '         current_week         = 1,' || chr(10) ||
      '         updated_at           = now()' || chr(10) ||
      '   where id = v_uid;'
    );
  else
    definition := replace(definition, 'xp                   = 0', 'xp_total             = 0');
    definition := replace(definition, 'xp = 0,', 'xp_total = 0,');
  end if;

  -- 3. Whatever is still missing from the practice tables added since 0040.
  --    Anchored on the week_output_submissions delete rather than one exact
  --    spelling of it, since step 1 may have rewritten that line.
  foreach v_table in array array[
    'week_vocabulary_attempts',
    'week_grammar_attempts',
    'week_input_answers'
  ] loop
    if position('public.' || v_table in definition) = 0 then
      definition := regexp_replace(
        definition,
        'delete from public\.week_output_submissions where user_id = [^;]*;',
        '\&' || chr(10) || format('  delete from public.%I where user_id = v_uid;', v_table),
        ''
      );
    end if;
  end loop;

  if position('public.week_output_submissions' in definition) = 0 then
    raise exception 'Deletion RPC anchor missing';
  end if;

  execute definition;
end $$;

-- Guard the result so a later regression fails here rather than at delete time.
do $$
declare
  definition text;
  v_table    text;
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;

  foreach v_table in array array[
    'vocabulary_review_items',
    'cefr_checkpoint_attempts',
    'cefr_objective_progress',
    'progress_logs'
  ] loop
    if position('delete from public.' || v_table || ' where user_id' in definition) > 0
       and position('to_regclass(''public.' || v_table || ''')' in definition) = 0 then
      raise exception 'Un-optional table % is deleted without a to_regclass guard', v_table;
    end if;
  end loop;

  if definition !~ 'xp_total\s+= 0' then
    raise exception 'Deletion RPC no longer resets xp_total';
  end if;
  if position('xp                   = 0' in definition) > 0 then
    raise exception 'Deletion RPC still writes the non-existent xp column';
  end if;
  if definition !~ 'current_week\s+= 1' then
    raise exception 'Deletion RPC does not restart current_week';
  end if;
end $$;
