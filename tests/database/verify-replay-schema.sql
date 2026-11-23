-- Runs on a database built by replaying every migration in order, before the
-- deletion test. verify_app_schema() is a declared-object guard, not a full
-- schema diff, so this asserts what the guard can actually promise: nothing it
-- declares is missing. Exact counts are deliberately not pinned -- a snapshot
-- number turns every legitimate new migration into a red build and tells you
-- nothing, while a missing object is a real failure.
\set ON_ERROR_STOP on
do $$
declare
  actual jsonb := public.verify_app_schema();
  broken text;
begin
  if not (actual->>'covered')::boolean then
    raise exception 'Fresh replay leaves verify_app_schema uncovered: %', actual;
  end if;
  for broken in
    select key from jsonb_each(actual)
    where key like 'missing_%' and jsonb_array_length(value) > 0
  loop
    raise exception 'Fresh replay: % is not empty: %', broken, actual->broken;
  end loop;

  -- The two tables this branch adds must exist *and* be counted by the guard,
  -- otherwise "covered" could still be true while the guard never looked.
  if to_regclass('public.week_vocabulary_attempts') is null
     or to_regclass('public.week_grammar_attempts') is null then
    raise exception 'Fresh replay did not create the week practice attempt tables';
  end if;

  raise notice 'Fresh verify_app_schema: %', actual;
end $$;
