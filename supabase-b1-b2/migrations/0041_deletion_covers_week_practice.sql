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

  foreach branch in array array[
    'week_vocabulary_attempts',
    'week_grammar_attempts'
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
