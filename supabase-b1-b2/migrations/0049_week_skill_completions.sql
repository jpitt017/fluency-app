-- ============================================================================
-- Migration 0049: a completion record for the grammar and vocabulary practice
-- on /week/[n].
--
-- The page had no ending: on the last step the Next button was simply disabled,
-- and nothing recorded that the learner had finished the section. This table is
-- that record -- one row per learner, week and skill, overwritten if they go
-- back and finish again.
--
-- The per-item answers already live in week_grammar_attempts and
-- week_vocabulary_attempts (0040, 0042), so this table stores no answer and no
-- key: only the counts the summary shows, so a reload can repeat the same
-- sentence the learner read when they finished.
--
-- Deliberately NOT wired into refresh_current_week(). The brief for this work
-- says completing grammar and vocabulary must not change week unlocking yet, so
-- 0031's rule (speaking + writing + reading or listening) stays exactly as it
-- is. A test pins that.
-- ============================================================================

create table if not exists public.week_skill_completions (
  user_id      uuid     not null references auth.users(id) on delete cascade,
  week_number  smallint not null check (week_number between 1 and 4),
  skill        text     not null check (skill in ('grammar', 'vocabulary')),
  answered     int      not null default 0 check (answered >= 0),
  correct      int      not null default 0 check (correct >= 0),
  total        int      not null default 0 check (total >= 0),
  -- How many mistakes the summary told the learner are now in their Review.
  review_count int      not null default 0 check (review_count >= 0),
  completed_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, week_number, skill)
);

alter table public.week_skill_completions enable row level security;
-- Only trusted server code writes a completion; a learner may read their own.
revoke all on public.week_skill_completions from public, anon, authenticated;
grant select on public.week_skill_completions to authenticated;
grant all on public.week_skill_completions to service_role;

drop policy if exists "read own week practice completions" on public.week_skill_completions;
create policy "read own week practice completions" on public.week_skill_completions
  for select to authenticated using (user_id = auth.uid());

drop trigger if exists week_skill_completions_touch on public.week_skill_completions;
create trigger week_skill_completions_touch before update on public.week_skill_completions
  for each row execute function public.touch_updated_at();

-- "Delete my data" -------------------------------------------------------------
--
-- Additive, like 0041/0043: read the current function, insert the branch if it
-- is missing, leave every other branch alone.
--
-- The anchor is the final `return jsonb_build_object(`, because the two shapes
-- this function legitimately has do not share a week-table line: production
-- deletes the week tables from inside an optional-table `foreach`, while a fresh
-- replay of this repo has them as individual to_regclass guards (0044). Both
-- end with the return, so the delete lands at function scope in either shape.
-- Anchoring on a `week_*` delete instead would nest the new statement inside
-- whichever guard happens to come first.
--
-- Re-running this file is a no-op: the position() test short-circuits.
do $$
declare
  definition text;
  anchor text := 'return jsonb_build_object(';
  branch text;
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position('public.week_skill_completions' in definition) = 0 then
    if position(anchor in definition) = 0 then
      raise exception 'Deletion RPC anchor missing';
    end if;
    branch := 'if to_regclass(''public.week_skill_completions'') is not null then '
      || 'execute ''delete from public.week_skill_completions where user_id = $1'' using v_uid; '
      || 'end if;';
    definition := replace(definition, anchor, branch || chr(10) || '  ' || anchor);
    execute definition;
  end if;
end $$;

-- Fail loudly rather than ship a table "Delete my data" cannot see.
do $$
begin
  if position('public.week_skill_completions' in pg_get_functiondef('public.delete_my_learning_data()'::regprocedure)) = 0 then
    raise exception 'delete_my_learning_data() does not clear week_skill_completions';
  end if;
end $$;

notify pgrst, 'reload schema';
