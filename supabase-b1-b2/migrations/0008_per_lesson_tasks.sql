-- ============================================================================
-- 0008 — per-lesson output tasks, checkpoint wiring, deck-aware review
--
-- Before this migration every lesson in a module shared one speaking task and
-- one writing task (both module-scoped, `lesson_id` null), and `get_lesson`
-- picked them arbitrarily. The lesson's own authored output block was ignored.
--
-- This migration derives a lesson-level task from each lesson's output block
-- (title, prompt, target seconds, word range are authored per lesson) and
-- inherits the module's phrases/linkers/outline as scaffolding.
--
-- Idempotent: re-running never duplicates a lesson-level task.
-- ============================================================================

-- 1. A speaking task for every non-writing lesson ---------------------------
insert into public.speaking_tasks (
  module_id, lesson_id, kind, title, prompt, target_seconds,
  useful_phrases, target_linkers, target_terms, rubric, xp_reward
)
select
  l.module_id,
  l.id,
  case coalesce(b.content->>'mode', 'speaking')
    when 'speaking' then 'monologue'::task_kind
    when 'review'   then 'discussion'::task_kind
    else 'prompt_card'::task_kind
  end,
  b.title,
  b.content->>'summary',
  least(300, greatest(30, coalesce((b.content->>'target_seconds')::int, 60))),
  coalesce(t.useful_phrases, '{}'::text[]),
  coalesce(t.target_linkers, '{}'::text[]),
  coalesce(t.target_terms, '{}'::text[]),
  coalesce(
    t.rubric,
    '["fluency","vocabulary range","grammar accuracy","coherence","pronunciation"]'::jsonb
  ),
  40
from public.lessons l
join public.lesson_blocks b
  on b.lesson_id = l.id and b.block_kind = 'output'
left join lateral (
  select st.*
  from public.speaking_tasks st
  where st.module_id = l.module_id
    and st.lesson_id is null
  order by case st.kind
             when 'prompt_card' then 0
             when 'monologue'   then 1
             when 'role_play'   then 2
             else 3
           end,
           st.target_seconds
  limit 1
) t on true
where coalesce(b.content->>'mode', '') <> 'writing'
  and not exists (select 1 from public.speaking_tasks x where x.lesson_id = l.id);

-- 2. A writing task for every writing lesson --------------------------------
insert into public.writing_tasks (
  module_id, lesson_id, title, prompt, format, word_min, word_max, outline, xp_reward
)
select
  l.module_id,
  l.id,
  b.title,
  b.content->>'summary',
  coalesce(t.format, 'short text'),
  coalesce((b.content->'word_range'->>0)::int, 120),
  coalesce((b.content->'word_range'->>1)::int, 180),
  coalesce(
    t.outline,
    jsonb_build_object(
      'analyze', 'Read the prompt twice and underline the task words.',
      'plan', 'Plan three or four points before you write.',
      'draft', 'Write the whole text before editing.',
      'review', 'Check it answers the task, not just the topic.'
    )
  ),
  coalesce(t.xp_reward, 45)
from public.lessons l
join public.lesson_blocks b
  on b.lesson_id = l.id and b.block_kind = 'output'
left join lateral (
  select wt.*
  from public.writing_tasks wt
  where wt.module_id = l.module_id
    and wt.lesson_id is null
  limit 1
) t on true
where b.content->>'mode' = 'writing'
  and not exists (select 1 from public.writing_tasks x where x.lesson_id = l.id);

-- 3. Checkpoints know their module -----------------------------------------
update public.checkpoints c
set module_id = m.id
from public.modules m
where c.module_id is null
  and m.module_number = substring(c.timing_label from '[0-9]+')::int;

-- 4. get_lesson prefers lesson-level tasks ---------------------------------
create or replace function public.get_lesson(p_lesson_number integer)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'lesson', to_jsonb(l) - 'course_id',
    'module', jsonb_build_object(
      'id', m.id, 'number', m.module_number, 'title', m.title,
      'summary', m.summary, 'topic', m.vocabulary_topic,
      'grammar', m.grammar_focus, 'hours', m.hours),
    'blocks', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.sort_order)
      from public.lesson_blocks b where b.lesson_id = l.id), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.sort_order)
      from public.practice_items p where p.lesson_id = l.id), '[]'::jsonb),
    'input', coalesce(
      (select to_jsonb(ci) from public.content_inputs ci
        where ci.lesson_id = l.id limit 1),
      (select to_jsonb(ci) from public.content_inputs ci
        where ci.module_id = l.module_id
          and ci.kind = case when l.module_lesson_number % 2 = 0
                             then 'listening'::input_kind else 'reading'::input_kind end
        limit 1)),
    'speaking', coalesce(
      (select to_jsonb(st) from public.speaking_tasks st
        where st.lesson_id = l.id limit 1),
      (select to_jsonb(st) from public.speaking_tasks st
        where st.module_id = l.module_id
        order by st.target_seconds limit 1)),
    'writing', coalesce(
      (select to_jsonb(wt) from public.writing_tasks wt
        where wt.lesson_id = l.id limit 1),
      (select to_jsonb(wt) from public.writing_tasks wt
        where wt.module_id = l.module_id limit 1)),
    'progress', (select to_jsonb(lp) from public.lesson_progress lp
                  where lp.lesson_id = l.id and lp.user_id = auth.uid())
  )
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.lesson_number = p_lesson_number;
$function$;

grant execute on function public.get_lesson(integer) to anon, authenticated;

-- 5. Review queue can be scoped to a deck ----------------------------------
drop function if exists public.get_due_cards(integer);

create or replace function public.get_due_cards(p_limit integer default 20, p_deck_slug text default null)
returns table (
  card_id uuid, vocab_item_id uuid, term text, part_of_speech text, ipa text,
  definition text, example text, collocations text[], translation_es text,
  deck_slug text, deck_title text, ladder_step smallint, due_at timestamptz
)
language sql
stable
as $function$
  select c.id, vi.id, vi.term, vi.part_of_speech, vi.ipa, vi.definition, vi.example,
         vi.collocations, vi.translation_es, vd.slug, vd.title, c.ladder_step, c.due_at
  from public.vocab_cards c
  join public.vocab_items vi on vi.id = c.vocab_item_id
  join public.vocab_decks vd on vd.id = vi.deck_id
  where c.user_id = auth.uid()
    and not c.suspended
    and c.due_at <= now()
    and (p_deck_slug is null or vd.slug = p_deck_slug)
  order by c.due_at
  limit least(coalesce(p_limit, 20), 100);
$function$;

grant execute on function public.get_due_cards(integer, text) to authenticated;

-- 6. One checkpoint, ready to run ------------------------------------------
create or replace function public.get_checkpoint(p_code text)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'checkpoint', to_jsonb(c),
    'module', (select jsonb_build_object('number', m.module_number, 'title', m.title)
               from public.modules m where m.id = c.module_id),
    -- A 24-item mixed quiz drawn from every module up to this checkpoint.
    'items', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at, p.id)
      from (
        select pi.* from public.practice_items pi
        join public.lessons l on l.id = pi.lesson_id
        where c.module_id is not null
          and l.lesson_number <= coalesce((
            select m2.module_number * 8
            from public.modules m2 where m2.id = c.module_id), 8)
        order by md5(pi.id::text)
        limit 24
      ) p), '[]'::jsonb),
    'speaking', (select to_jsonb(st) from public.speaking_tasks st
                  where st.module_id = c.module_id or st.lesson_id in (
                    select id from public.lessons where course_id = c.course_id
                      and lesson_number <= coalesce((
                        select m3.module_number * 8 from public.modules m3 where m3.id = c.module_id), 8))
                  order by st.target_seconds desc limit 1),
    'writing', (select to_jsonb(wt) from public.writing_tasks wt
                 where wt.module_id = c.module_id
                 order by wt.word_max desc limit 1),
    'attempt', (select to_jsonb(ca) from public.checkpoint_attempts ca
                 where ca.checkpoint_id = c.id and ca.user_id = auth.uid()
                 order by ca.started_at desc limit 1)
  )
  from public.checkpoints c
  where c.code = p_code;
$function$;

grant execute on function public.get_checkpoint(text) to anon, authenticated;

-- 7. Record a checkpoint attempt in one round trip -------------------------
create or replace function public.complete_checkpoint(
  p_code text,
  p_scores jsonb,
  p_quiz_correct integer default 0,
  p_quiz_total integer default 0,
  p_speaking_attempt_id uuid default null,
  p_writing_submission_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_checkpoint uuid;
  v_total numeric;
  v_band text;
  v_attempt uuid;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select id into v_checkpoint from public.checkpoints where code = p_code;
  if v_checkpoint is null then
    raise exception 'Unknown checkpoint: %', p_code using errcode = '22023';
  end if;

  select round(avg(value::numeric), 1) into v_total
  from jsonb_each_text(coalesce(p_scores, '{}'::jsonb));

  v_band := case
    when v_total is null then 'ungraded'
    when v_total >= 80 then 'strong'
    when v_total >= 65 then 'on_track'
    else 'needs_work'
  end;

  v_result := jsonb_build_object(
    'overall', v_total,
    'band', v_band,
    'quiz_correct', p_quiz_correct,
    'quiz_total', p_quiz_total,
    'quiz_percent', case when p_quiz_total > 0
                         then round(100.0 * p_quiz_correct / p_quiz_total) else null end
  );

  insert into public.checkpoint_attempts (
    user_id, checkpoint_id, status, speaking_attempt_id, writing_submission_id,
    scores, result, started_at, completed_at
  ) values (
    v_uid, v_checkpoint, 'evaluated', p_speaking_attempt_id, p_writing_submission_id,
    coalesce(p_scores, '{}'::jsonb), v_result, now(), now()
  )
  returning id into v_attempt;

  perform public.award_xp(v_uid, 'checkpoint', 150, 'checkpoint_attempt', v_attempt,
                          (select title from public.checkpoints where id = v_checkpoint));

  return jsonb_build_object('attempt_id', v_attempt, 'result', v_result);
end;
$function$;

revoke all on function public.complete_checkpoint(text, jsonb, integer, integer, uuid, uuid) from public;
grant execute on function public.complete_checkpoint(text, jsonb, integer, integer, uuid, uuid) to authenticated;
