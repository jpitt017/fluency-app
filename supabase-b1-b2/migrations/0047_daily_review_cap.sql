-- The daily review cap needs to know how many cards a learner has already
-- reviewed today, and no existing table records that.
--
-- vocab_reviews has one row per grading, so vocab is already countable. Error
-- cards are not: apply_fsrs_review updates error_review_cards in place and only
-- writes last_review_at, so grading the same card twice in a day leaves no
-- second trace and a count would miss it. `reps` cannot stand in either: it is
-- a lifetime total, not today's.
--
-- So: one nullable timestamp. NULL means "not reviewed since this migration",
-- which reads as "not today" and is the correct answer for every existing row.
-- Deliberately not a new table, and nothing is backfilled.
alter table public.error_review_cards
  add column if not exists last_reviewed_on date;

comment on column public.error_review_cards.last_reviewed_on is
  'The learner-local date of the last grading, used only to count today''s reviews against the daily cap. Set by apply_fsrs_review().';

-- apply_fsrs_review is the one place an error card is graded, so it is the one
-- place this needs setting. The rest of the function is 0008's body verbatim
-- apart from the two added lines; re-declared in full because Postgres replaces
-- rather than patches a function body.
create or replace function public.apply_fsrs_review(
  p_card_type      text,
  p_card_id        uuid,
  p_grade          review_grade,
  p_due_at         timestamptz,
  p_interval_days  int,
  p_stability      numeric,
  p_difficulty     numeric,
  p_fsrs_state     smallint,
  p_learning_steps smallint,
  p_reps           int,
  p_lapses         int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_points     int;
  v_step       smallint;
  v_vocab_item uuid;
  v_cat        error_category;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_points := case p_grade
    when 'again' then 0
    when 'hard'  then 1
    when 'good'  then 2
    when 'easy'  then 3
  end;

  v_step := case
    when p_interval_days >= 60 then 5
    when p_interval_days >= 30 then 4
    when p_interval_days >= 14 then 3
    when p_interval_days >= 7  then 2
    when p_interval_days >= 3  then 1
    else 0
  end;

  if p_card_type = 'vocab' then
    update public.vocab_cards
       set due_at         = p_due_at,
           interval_days  = greatest(0, p_interval_days),
           stability      = greatest(0, p_stability),
           difficulty     = greatest(1, least(10, p_difficulty)),
           fsrs_state     = p_fsrs_state,
           learning_steps = greatest(0, p_learning_steps),
           reps           = greatest(0, p_reps),
           lapses         = greatest(0, p_lapses),
           ladder_step    = v_step,
           last_review_at = now(),
           updated_at     = now()
     where id = p_card_id and user_id = v_uid
    returning vocab_item_id into v_vocab_item;

    if v_vocab_item is null then
      raise exception 'Card not found' using errcode = 'no_data_found';
    end if;

    insert into public.vocab_reviews (user_id, card_id, vocab_item_id, grade, interval_days, due_at)
    values (v_uid, p_card_id, v_vocab_item, p_grade, greatest(0, p_interval_days), p_due_at);

    if v_points > 0 then
      perform public.award_xp(v_uid, 'vocab_review', v_points, 'vocab_item', v_vocab_item,
        format('FSRS review: %s', p_grade));
    end if;
  elsif p_card_type = 'error' then
    update public.error_review_cards
       set due_at         = p_due_at,
           interval_days  = greatest(0, p_interval_days),
           stability      = greatest(0, p_stability),
           difficulty     = greatest(1, least(10, p_difficulty)),
           fsrs_state     = p_fsrs_state,
           learning_steps = greatest(0, p_learning_steps),
           reps           = greatest(0, p_reps),
           lapses         = greatest(0, p_lapses),
           last_review_at = now(),
           last_reviewed_on = current_date,
           updated_at     = now()
     where id = p_card_id and user_id = v_uid
    returning category into v_cat;

    if v_cat is null then
      raise exception 'Error review card not found' using errcode = 'no_data_found';
    end if;

    if v_points > 0 then
      perform public.award_xp(v_uid, 'practice', v_points, 'error_review_card', p_card_id,
        format('Error FSRS (%s): %s', v_cat, p_grade));
    end if;
  else
    raise exception 'Invalid card type' using errcode = '22023';
  end if;

  perform public.record_activity(v_uid);

  return jsonb_build_object(
    'card_id', p_card_id,
    'card_type', p_card_type,
    'grade', p_grade,
    'interval_days', greatest(0, p_interval_days),
    'due_at', p_due_at,
    'ladder_step', v_step,
    'xp', v_points
  );
end;
$$;

revoke all on function public.apply_fsrs_review(text, uuid, review_grade, timestamptz, int, numeric, numeric, smallint, smallint, int, int) from public, anon;
grant execute on function public.apply_fsrs_review(text, uuid, review_grade, timestamptz, int, numeric, numeric, smallint, smallint, int, int) to authenticated;

-- Marking a card mastered is not a scheduled review, but it is unmistakably a
-- review of that card today, and it competes for the same daily allowance.
-- 0011's body verbatim except for the one added assignment.
create or replace function public.mark_error_card_mastered(
  p_card_id      uuid,
  p_attempt_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_cat           error_category;
  v_revealed_at   timestamptz;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select category, hint_revealed_at
    into v_cat, v_revealed_at
    from public.error_review_cards
   where id = p_card_id and user_id = v_uid;

  if v_cat is null then
    raise exception 'Error review card not found' using errcode = 'no_data_found';
  end if;

  -- Block same-session copy-paste mastery after clicking reveal
  if v_revealed_at is not null and v_revealed_at > now() - interval '6 hours' then
    return jsonb_build_object(
      'card_id', p_card_id,
      'mastered', false,
      'xp', 0,
      'reason', 'revealed_recently'
    );
  end if;

  update public.error_review_cards
     set mastered          = true,
         mastered_at       = now(),
         suspended         = true,
         last_attempt_text = p_attempt_text,
         last_review_at    = now(),
         last_reviewed_on  = current_date,
         reps              = reps + 1,
         updated_at        = now()
   where id = p_card_id and user_id = v_uid;

  perform public.award_xp(v_uid, 'practice', 5, 'error_review_mastered', p_card_id,
    format('Mastered %s repair unprompted', v_cat));
  perform public.record_activity(v_uid);

  return jsonb_build_object('card_id', p_card_id, 'mastered', true, 'xp', 5);
end;
$$;

revoke all on function public.mark_error_card_mastered(uuid, text) from public, anon;
grant execute on function public.mark_error_card_mastered(uuid, text) to authenticated;

-- The due queue now has to order by how often a card was missed, so give the
-- query an index that can serve it.
create index if not exists error_review_cards_due_queue_idx
  on public.error_review_cards(user_id, due_at)
  where not suspended and not mastered;

-- Guard the result: a later migration must not silently drop the column or the
-- stamp, or the daily cap would quietly stop counting error cards again.
do $$
declare
  v_definition text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'error_review_cards'
      and column_name = 'last_reviewed_on'
  ) then
    raise exception 'error_review_cards.last_reviewed_on is missing';
  end if;

  select pg_get_functiondef('public.apply_fsrs_review(text, uuid, review_grade, timestamptz, int, numeric, numeric, smallint, smallint, int, int)'::regprocedure)
    into v_definition;
  if position('last_reviewed_on' in v_definition) = 0 then
    raise exception 'apply_fsrs_review no longer records the review date';
  end if;

  select pg_get_functiondef('public.mark_error_card_mastered(uuid, text)'::regprocedure)
    into v_definition;
  if position('last_reviewed_on' in v_definition) = 0 then
    raise exception 'mark_error_card_mastered no longer records the review date';
  end if;
end $$;
