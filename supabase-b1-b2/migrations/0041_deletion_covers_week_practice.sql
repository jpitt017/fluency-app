-- Make "Delete my data" erase the Week 1-4 practice attempts.
--
-- Instances that ran an older copy of this work already hold the vocabulary
-- table and the deletion branch for it, so this has to *add* to the live
-- function, not replace it: replacing the body wholesale is how a later branch
-- silently drops the tables an earlier fix added. Read the current definition,
-- insert whichever branches are missing, and leave everything else untouched.
do $$
declare
  definition text;
  anchor text := 'delete from public.week_output_submissions where user_id = v_uid;';
  branch text;
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position(anchor in definition) = 0 then
    raise exception 'Deletion RPC anchor missing';
  end if;

  -- 0011 and 0024 both build this function as a list of plain deletes, and some
  -- of the tables they name (vocabulary_review_items, cefr_checkpoint_attempts,
  -- cefr_objective_progress, progress_logs) are never created by any migration.
  -- Live's function guards each optional delete with to_regclass, but that guard
  -- exists in no migration here, so a freshly built database cannot delete
  -- anything: the first missing table aborts the transaction. Repair the deletes
  -- in place, then add the new branches the same way.
  definition := regexp_replace(
    definition,
    'delete from public\.([a-z_]+) where user_id = v_uid;',
    'if to_regclass(''public.\1'') is not null then '
      || 'execute ''delete from public.\1 where user_id = $1'' using v_uid; end if;',
    'g'
  );

  -- The reset block writes `xp`, and profiles has only ever had `xp_total`
  -- (0002), so that update fails with 42703 and rolls back the whole deletion.
  definition := replace(definition, 'xp                   = 0', 'xp_total             = 0');
  definition := replace(definition, 'xp = 0,', 'xp_total = 0,');

  execute definition;

  -- Add the branches from the repaired definition, so an extra regexp pass
  -- cannot turn the new lines into a second guard around themselves.
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  foreach branch in array array[
    'week_vocabulary_attempts'
  ] loop
    if position('public.' || branch in definition) = 0 then
      definition := replace(
        definition,
        anchor,
        anchor || chr(10) || format('  delete from public.%I where user_id = v_uid;', branch)
      );
    end if;
  end loop;

  execute definition;
end $$;

-- The guard that reports any table with a user_id column the deletion RPC does
-- not clear. This is 0026's body verbatim; the only change is that the dynamic
-- loop's exclusion list keeps naming the tables whose deletion is executed by
-- name (quote_literal), so a rename cannot quietly hide one.
create or replace function public.verify_delete_my_learning_data_coverage()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_fn_def text;
  v_missing text[] := '{}';
  v_tbl text;
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into v_fn_def;
  for v_tbl in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
      and c.table_name not in ('subscriptions', 'pilot_learners')
    order by c.table_name
  loop
    if position('public.' || v_tbl in v_fn_def) = 0
       and not (v_tbl = any(array['vocabulary_review_items', 'cefr_checkpoint_attempts', 'cefr_objective_progress', 'progress_logs'])
                and position(quote_literal(v_tbl) in v_fn_def) > 0) then
      v_missing := array_append(v_missing, v_tbl);
    end if;
  end loop;
  return jsonb_build_object('covered', cardinality(v_missing) = 0, 'missing_tables', to_jsonb(v_missing));
end;
$$;

revoke all on function public.verify_delete_my_learning_data_coverage() from public, anon, authenticated;
grant execute on function public.verify_delete_my_learning_data_coverage() to service_role;
