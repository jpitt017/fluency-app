-- ============================================================================
-- Lesson read model for the app plus a signed-out preview.
--
-- 1. get_lesson(n) returns everything a lesson page needs in one round trip:
--    lesson, module, the five blocks, practice items, the module input and
--    tasks, and the signed-in learner's progress row.
-- 2. Signed-out visitors may read the shape of the curriculum (lesson plan,
--    blocks, inputs, tasks, vocabulary) so the catalogue stays public, as the
--    static version was. Practice items — which contain the answers — stay
--    behind authentication, so get_lesson() simply returns an empty array.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'lessons', 'lesson_blocks', 'content_inputs', 'speaking_tasks',
    'writing_tasks', 'vocab_decks', 'vocab_items'
  ] loop
    execute format('drop policy if exists "public preview %1$s" on public.%1$I', t);
    execute format(
      'create policy "public preview %1$s" on public.%1$I for select to anon using (true)', t
    );
  end loop;
end;
$$;

-- Practice items keep their authenticated-only policy; just make sure there is
-- no leftover anon policy from an earlier run.
drop policy if exists "public preview practice_items" on public.practice_items;

create or replace function public.get_lesson(p_lesson_number int)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'lesson', to_jsonb(l) - 'course_id',
    'module', jsonb_build_object(
      'id', m.id,
      'number', m.module_number,
      'title', m.title,
      'summary', m.summary,
      'topic', m.vocabulary_topic,
      'grammar', m.grammar_focus,
      'hours', m.hours
    ),
    'blocks', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.sort_order)
      from public.lesson_blocks b where b.lesson_id = l.id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.sort_order)
      from public.practice_items p where p.lesson_id = l.id
    ), '[]'::jsonb),
    'input', (
      select to_jsonb(ci)
      from public.content_inputs ci
      where ci.module_id = l.module_id
        and ci.kind = case when l.module_lesson_number % 2 = 0 then 'listening'::input_kind
                          else 'reading'::input_kind end
      limit 1
    ),
    'speaking', (
      select to_jsonb(st) from public.speaking_tasks st
      where st.module_id = l.module_id
      order by st.target_seconds
      limit 1
    ),
    'writing', (
      select to_jsonb(wt) from public.writing_tasks wt
      where wt.module_id = l.module_id
      limit 1
    ),
    'progress', (
      select to_jsonb(lp) from public.lesson_progress lp
      where lp.lesson_id = l.id and lp.user_id = auth.uid()
    )
  )
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.lesson_number = p_lesson_number;
$$;

revoke all on function public.get_lesson(int) from public;
grant execute on function public.get_lesson(int) to anon, authenticated;

-- 3. Curriculum outline for the index page: modules with their eight lessons,
--    plus the signed-in learner's completion state.
create or replace function public.get_curriculum_outline()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'course', (select to_jsonb(c) from public.courses c where c.published order by c.total_hours desc limit 1),
    'modules', coalesce((
      select jsonb_agg(module_json order by module_number)
      from (
        select m.module_number,
               jsonb_build_object(
                 'id', m.id,
                 'number', m.module_number,
                 'title', m.title,
                 'summary', m.summary,
                 'topic', m.vocabulary_topic,
                 'grammar', m.grammar_focus,
                 'hours', m.hours,
                 'lesson_start', m.lesson_start,
                 'lesson_end', m.lesson_end,
                 'lessons', coalesce((
                   select jsonb_agg(jsonb_build_object(
                     'id', l.id,
                     'number', l.lesson_number,
                     'module_lesson', l.module_lesson_number,
                     'title', l.title,
                     'objective', l.objective,
                     'can_do', l.can_do,
                     'skill', l.primary_skill,
                     'status', coalesce(lp.status::text, 'not_started'),
                     'practice_correct', lp.practice_correct,
                     'practice_total', lp.practice_total,
                     'completed_at', lp.completed_at
                   ) order by l.module_lesson_number)
                   from public.lessons l
                   left join public.lesson_progress lp
                     on lp.lesson_id = l.id and lp.user_id = auth.uid()
                   where l.module_id = m.id
                 ), '[]'::jsonb)
               ) as module_json
        from public.modules m
        where m.course_id = (select id from public.courses where published order by total_hours desc limit 1)
      ) s
    ), '[]'::jsonb),
    'skills', coalesce((
      select jsonb_object_agg(sl.skill, sl.score)
      from public.skill_levels sl where sl.user_id = auth.uid()
    ), '{}'::jsonb),
    'due_cards', (
      select count(*) from public.vocab_cards c
      where c.user_id = auth.uid() and not c.suspended and c.due_at <= now()
    ),
    'checkpoints', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', cp.code, 'title', cp.title, 'timing', cp.timing_label,
        'description', cp.description, 'module', m.module_number,
        'status', coalesce(ca.status::text, 'not_started'),
        'completed_at', ca.completed_at
      ) order by cp.timing_label)
      from public.checkpoints cp
      left join public.modules m on m.id = cp.module_id
      left join public.checkpoint_attempts ca
        on ca.checkpoint_id = cp.id and ca.user_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_curriculum_outline() from public;
grant execute on function public.get_curriculum_outline() to anon, authenticated;
