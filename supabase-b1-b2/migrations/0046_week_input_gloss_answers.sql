-- Make week_input_answers able to hold the gloss-check answers.
--
-- No new table. The gloss check is one encouraged bonus task a week, marked on
-- the server and stored beside the reading and listening answers that already
-- live here, so "Delete my data" covers it without another deletion branch.
--
-- One thing does need changing. 0043 allows item ids of 1–30 characters, which
-- fits "L1-G1" but not "gloss-1-1". Without this migration the insert fails, the
-- route returns a 503, and the learner sees an error for an answer that was
-- right -- the kind of failure that is easy to miss because it only happens on
-- the optional path.
--
-- Widening the check is additive: every id that was valid before is still valid,
-- nothing is rewritten, and re-running this file is a no-op.
--
-- 0043 declared the column check inline, so its constraint name is whatever
-- Postgres generated. Find it by definition rather than assuming a name that has
-- never been checked against live.
do $$
declare
  v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'public.week_input_answers'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%item_id%'
    and pg_get_constraintdef(oid) like '%30%';
  if v_name is not null then
    execute format('alter table public.week_input_answers drop constraint %I', v_name);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.week_input_answers'::regclass
      and contype = 'c'
      and conname = 'week_input_answers_item_id_length'
  ) then
    alter table public.week_input_answers
      add constraint week_input_answers_item_id_length
      check (length(item_id) between 1 and 40);
  end if;
end $$;

-- The transcript gate and the gloss check read the same table with different
-- filters, so give the per-skill lookup its own index.
create index if not exists week_input_answers_user_skill_idx
  on public.week_input_answers(user_id, week_number, skill);

-- Guard the result, so a later migration cannot quietly narrow it again.
do $$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conrelid = 'public.week_input_answers'::regclass
    and conname = 'week_input_answers_item_id_length';
  if v_definition is null then
    raise exception 'week_input_answers has no item_id length check';
  end if;
  if position('40' in v_definition) = 0 then
    raise exception 'week_input_answers item_id check is narrower than the gloss ids (%)', v_definition;
  end if;
end $$;
