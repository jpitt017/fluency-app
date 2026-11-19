-- ============================================================================
-- Curriculum importer.
--
-- Authored content lives in ../../content/curriculum/*.json (one file per pair
-- of modules). This function expands that document into the relational tables
-- so the seed stays reproducible and reviewable.
--
-- Usage (server-side only, migrations / service role):
--   select public.import_modules('{"course_slug":"english-b1-b2","modules":[...]}'::jsonb);
--
-- The importer is idempotent: lessons, blocks and practice items are rebuilt,
-- but learner attempts are never orphaned — a lesson that already has attempts
-- keeps its existing practice items.
-- ============================================================================

create or replace function public.import_course(doc jsonb)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.courses (
    slug, title, subtitle, description, level_from, level_to, total_hours,
    weekly_hours, duration_weeks, daily_minutes_min, daily_minutes_max,
    daily_flow, skill_balance, published
  ) values (
    doc->>'slug',
    doc->>'title',
    doc->>'subtitle',
    doc->>'description',
    coalesce((doc->>'level_from')::cefr_level, 'B1'),
    coalesce((doc->>'level_to')::cefr_level, 'B2'),
    coalesce((doc->>'total_hours')::int, 64),
    (doc->>'weekly_hours')::numeric,
    (doc->>'duration_weeks')::int,
    coalesce((doc->>'daily_minutes_min')::int, 20),
    coalesce((doc->>'daily_minutes_max')::int, 45),
    coalesce(doc->'daily_flow', '[]'::jsonb),
    coalesce(doc->'skill_balance', '[]'::jsonb),
    coalesce((doc->>'published')::boolean, true)
  )
  on conflict (slug) do update
    set title = excluded.title,
        subtitle = excluded.subtitle,
        description = excluded.description,
        total_hours = excluded.total_hours,
        weekly_hours = excluded.weekly_hours,
        duration_weeks = excluded.duration_weeks,
        daily_flow = excluded.daily_flow,
        skill_balance = excluded.skill_balance,
        published = excluded.published
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.import_modules(doc jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_course       uuid;
  v_mod          jsonb;
  v_mod_id       uuid;
  v_deck_id      uuid;
  v_deck_title   text;
  v_deck_slug    text;
  v_grammar      jsonb;
  v_lesson       jsonb;
  v_input        jsonb;
  v_task         jsonb;
  v_i            int;
  v_k            int;
  v_n            int;
  v_gcount       int;
  v_gi           int;
  v_lesson_id    uuid;
  v_lesson_num   int;
  v_mod_count    int := 0;
  v_lesson_count int := 0;
  v_item_count   int := 0;
begin
  select id into v_course from public.courses where slug = doc->>'course_slug';
  if v_course is null then
    raise exception 'Unknown course: %', doc->>'course_slug';
  end if;

  for v_mod in select * from jsonb_array_elements(doc->'modules') loop
    v_n := (v_mod->>'number')::int;
    v_gcount := jsonb_array_length(coalesce(v_mod->'grammar', '[]'::jsonb));

    insert into public.modules (
      course_id, module_number, title, summary, hours, lesson_start, lesson_end,
      grammar_focus, vocabulary_topic, skill_mix
    ) values (
      v_course, v_n, v_mod->>'title', v_mod->>'summary',
      coalesce((v_mod->>'hours')::int, 8),
      (v_n - 1) * 8 + 1, v_n * 8,
      coalesce(array(select g->>'name' from jsonb_array_elements(coalesce(v_mod->'grammar','[]'::jsonb)) g), '{}'),
      v_mod->>'vocabularyTopic',
      coalesce(v_mod->'skillMix', '{}'::jsonb)
    )
    on conflict (course_id, module_number) do update
      set title = excluded.title,
          summary = excluded.summary,
          hours = excluded.hours,
          lesson_start = excluded.lesson_start,
          lesson_end = excluded.lesson_end,
          grammar_focus = excluded.grammar_focus,
          vocabulary_topic = excluded.vocabulary_topic,
          skill_mix = excluded.skill_mix
    returning id into v_mod_id;

    -- Vocabulary deck -----------------------------------------------------
    v_deck_slug := format('module-%s', v_n);
    v_deck_title := format('Module %s · %s', v_n, v_mod->>'vocabularyTopic');

    insert into public.vocab_decks (course_id, module_id, slug, title, topic, description, daily_target)
    values (
      v_course, v_mod_id, v_deck_slug, v_deck_title, v_mod->>'vocabularyTopic',
      coalesce(v_mod->>'vocabularyDescription', v_deck_title), 10
    )
    on conflict (slug) do update
      set module_id = excluded.module_id,
          title = excluded.title,
          topic = excluded.topic,
          description = excluded.description
    returning id into v_deck_id;

    for v_i in 0 .. jsonb_array_length(coalesce(v_mod->'vocab', '[]'::jsonb)) - 1 loop
      insert into public.vocab_items (
        deck_id, term, part_of_speech, ipa, definition, example, collocations, translation_es, band
      ) values (
        v_deck_id,
        v_mod->'vocab'->v_i->>'term',
        coalesce(v_mod->'vocab'->v_i->>'pos', 'phrase'),
        v_mod->'vocab'->v_i->>'ipa',
        v_mod->'vocab'->v_i->>'definition',
        v_mod->'vocab'->v_i->>'example',
        coalesce(array(select jsonb_array_elements_text(coalesce(v_mod->'vocab'->v_i->'collocations','[]'::jsonb))), '{}'),
        v_mod->'vocab'->v_i->>'translation',
        coalesce((v_mod->'vocab'->v_i->>'band')::cefr_level, 'B1')
      )
      on conflict (deck_id, term) do update
        set definition = excluded.definition,
            example = excluded.example,
            collocations = excluded.collocations,
            translation_es = excluded.translation_es,
            ipa = excluded.ipa;
    end loop;

    -- Lessons -------------------------------------------------------------
    for v_lesson, v_i in
      select value, ordinality
      from jsonb_array_elements(v_mod->'lessons') with ordinality as t(value, ordinality)
    loop
      v_lesson_num := (v_n - 1) * 8 + v_i::int;
      v_gi := case when v_i <= 4 then 0 else least(1, greatest(v_gcount - 1, 0)) end;
      v_grammar := coalesce(v_mod->'grammar'->v_gi, '{}'::jsonb);

      insert into public.lessons (
        course_id, module_id, lesson_number, module_lesson_number, title, objective,
        can_do, grammar_point_key, grammar_point, explanation, primary_skill,
        duration_minutes, xp_reward
      ) values (
        v_course, v_mod_id, v_lesson_num, v_i::int,
        v_lesson->>'title',
        v_lesson->>'objective',
        v_lesson->>'canDo',
        v_grammar->>'key',
        v_grammar->>'name',
        coalesce(v_lesson->>'explanation', v_grammar->>'explanation'),
        coalesce((v_lesson->>'skill')::skill_area, 'grammar'),
        coalesce((v_lesson->>'minutes')::int, 12),
        coalesce((v_lesson->>'xp')::int, 20)
      )
      on conflict (course_id, lesson_number) do update
        set module_id = excluded.module_id,
            module_lesson_number = excluded.module_lesson_number,
            title = excluded.title,
            objective = excluded.objective,
            can_do = excluded.can_do,
            grammar_point_key = excluded.grammar_point_key,
            grammar_point = excluded.grammar_point,
            explanation = excluded.explanation,
            primary_skill = excluded.primary_skill,
            duration_minutes = excluded.duration_minutes,
            xp_reward = excluded.xp_reward
      returning id into v_lesson_id;

      v_lesson_count := v_lesson_count + 1;

      -- Lesson ↔ vocabulary mapping: a six-item window that slides by one
      -- item per lesson, so every lesson has 8–12 reviewable items without
      -- duplicating authored content.
      insert into public.lesson_vocab (lesson_id, vocab_item_id, sort_order)
      select v_lesson_id, it.id, k
      from (
        select vi.id,
               (row_number() over (order by vi.term) - 1) as idx,
               count(*) over () as total
        from public.vocab_items vi
        where vi.deck_id = v_deck_id
      ) it
      cross join generate_series(1, 6) as k
      where it.idx = ((v_i::int - 1 + k - 1) % it.total)
      on conflict do nothing;

      -- Five-block daily lesson (warm-up → input → practice → output → feedback)
      insert into public.lesson_blocks (lesson_id, block_kind, sort_order, minutes, title, content)
      values
        (v_lesson_id, 'warm_up', 1, 3, 'Spaced-repetition warm-up',
         jsonb_build_object(
           'summary', format('Recall 8 cards from %s before the new language.', v_deck_title),
           'card_count', 8, 'deck_slug', v_deck_slug,
           'review_ladder_days', jsonb_build_array(1, 3, 7, 14, 30))),
        (v_lesson_id, 'input', 2, 8, 'Model: ' || coalesce(v_grammar->>'name', 'Language input'),
         jsonb_build_object(
           'summary', coalesce(v_grammar->>'explanation', v_lesson->>'objective'),
           'key_points', coalesce(v_grammar->'keyPoints', '[]'::jsonb),
           'model_example', coalesce(v_grammar->>'example', ''),
           'input_kind', coalesce(v_lesson->>'input', 'reading'))),
        (v_lesson_id, 'practice', 3, 10, 'Guided practice',
         jsonb_build_object(
           'summary', format('8 interactive items: 2 on %s plus 6 vocabulary checks.', coalesce(v_grammar->>'name', 'the target language')),
           'item_count', 8,
           'mix', jsonb_build_object('grammar', 2, 'vocabulary', 6),
           'answer_mode', 'instant')),
        (v_lesson_id, 'output', 4, 10, 'Produce: ' || coalesce(v_lesson->>'outputTitle', v_lesson->>'title'),
         jsonb_build_object(
           'summary', coalesce(v_lesson->>'output', v_lesson->>'objective'),
           'can_do', v_lesson->>'canDo',
           'mode', coalesce(v_lesson->>'skill', 'speaking'),
           'target_seconds', coalesce((v_lesson->>'targetSeconds')::int, 90),
           'word_range', coalesce(v_lesson->'wordRange', jsonb_build_array(120, 150)))),
        (v_lesson_id, 'feedback', 5, 3, 'Feedback & can-do check',
         jsonb_build_object(
           'summary', 'Corrections, one alternative phrasing per error, and a progress update.',
           'can_do', v_lesson->>'canDo',
           'rubric', case when coalesce(v_lesson->>'skill', 'speaking') = 'writing'
                          then jsonb_build_array('task response', 'organisation', 'grammar accuracy', 'vocabulary range', 'style')
                          else jsonb_build_array('fluency', 'vocabulary range', 'grammar accuracy', 'coherence', 'pronunciation')
                     end))
      on conflict (lesson_id, sort_order) do update
        set block_kind = excluded.block_kind,
            minutes = excluded.minutes,
            title = excluded.title,
            content = excluded.content;

      -- Practice items: 2 grammar + 6 vocabulary, only rebuilt while the
      -- learner has no attempts recorded for this lesson.
      if not exists (select 1 from public.practice_attempts pa where pa.lesson_id = v_lesson_id) then
        delete from public.practice_items where lesson_id = v_lesson_id;

        if jsonb_array_length(coalesce(v_grammar->'items', '[]'::jsonb)) > 0 then
          insert into public.practice_items (
            lesson_id, kind, sort_order, prompt, options, answer, explanation, grammar_point, difficulty
          )
          select v_lesson_id, 'multiple_choice', gs.k,
                 v_grammar->'items'->gi.idx->>'prompt',
                 coalesce(v_grammar->'items'->gi.idx->'options', '[]'::jsonb),
                 v_grammar->'items'->gi.idx->>'answer',
                 v_grammar->'items'->gi.idx->>'explanation',
                 v_grammar->>'name',
                 coalesce((v_grammar->'items'->gi.idx->>'difficulty')::smallint, 1)
          from generate_series(1, 2) as gs(k)
          cross join lateral (
            select ((v_i::int - 1 + gs.k - 1) % jsonb_array_length(v_grammar->'items'))::int as idx
          ) gi;
        end if;

        insert into public.practice_items (
          lesson_id, kind, sort_order, prompt, options, answer, explanation, grammar_point, difficulty
        )
        select
          v_lesson_id, 'multiple_choice', p.ord,
          format('Which expression matches this meaning? "%s"', p.definition),
          jsonb_build_array(p.term) || coalesce((
            select jsonb_agg(d.term order by d.term)
            from (
              select vi2.term
              from public.vocab_items vi2
              where vi2.deck_id = v_deck_id and vi2.term <> p.term
              order by md5(vi2.term || p.ord::text), vi2.term
              limit 2
            ) d
          ), '[]'::jsonb),
          p.term,
          format('Example: %s', p.example),
          v_grammar->>'name', 1
        from (
          select lv.vocab_item_id, vi.term, vi.definition, vi.example,
                 (row_number() over (order by lv.sort_order, vi.term) + 2)::smallint as ord
          from public.lesson_vocab lv
          join public.vocab_items vi on vi.id = lv.vocab_item_id
          where lv.lesson_id = v_lesson_id
        ) p;

        select count(*) into v_k from public.practice_items where lesson_id = v_lesson_id;
        v_item_count := v_item_count + v_k;
      end if;
    end loop;

    -- Listening / reading inputs -----------------------------------------
    if not exists (select 1 from public.content_inputs ci where ci.module_id = v_mod_id) then
      for v_input in select * from jsonb_array_elements(coalesce(v_mod->'inputs', '[]'::jsonb)) loop
        insert into public.content_inputs (
          module_id, lesson_id, kind, title, source_label, accent, body,
          duration_seconds, word_count, questions
        )
        select
          v_mod_id,
          (select l.id from public.lessons l
            where l.module_id = v_mod_id
              and l.module_lesson_number = coalesce((v_input->>'lesson')::int, 1)
            limit 1),
          (v_input->>'kind')::input_kind,
          v_input->>'title',
          coalesce(v_input->>'source', 'Studio original'),
          v_input->>'accent',
          v_input->>'body',
          (v_input->>'seconds')::int,
          array_length(regexp_split_to_array(btrim(v_input->>'body'), '\s+'), 1),
          coalesce(v_input->'questions', '[]'::jsonb);
      end loop;
    end if;

    -- Speaking tasks ------------------------------------------------------
    if not exists (select 1 from public.speaking_tasks st where st.module_id = v_mod_id) then
      for v_task in select * from jsonb_array_elements(coalesce(v_mod->'speaking', '[]'::jsonb)) loop
        insert into public.speaking_tasks (
          module_id, kind, title, prompt, target_seconds, useful_phrases,
          target_linkers, target_terms, rubric, xp_reward
        ) values (
          v_mod_id,
          coalesce((v_task->>'kind')::task_kind, 'prompt_card'),
          v_task->>'title',
          v_task->>'prompt',
          coalesce((v_task->>'seconds')::int, 120),
          coalesce(array(select jsonb_array_elements_text(coalesce(v_task->'phrases','[]'::jsonb))), '{}'),
          coalesce(array(select jsonb_array_elements_text(coalesce(v_task->'linkers','[]'::jsonb))), '{}'),
          coalesce(array(select jsonb_array_elements_text(coalesce(v_task->'terms','[]'::jsonb))), '{}'),
          jsonb_build_object(
            'fluency', 0.25, 'lexical_range', 0.2, 'grammar_accuracy', 0.2,
            'coherence', 0.15, 'pronunciation', 0.2),
          coalesce((v_task->>'xp')::int, 40)
        );
      end loop;
    end if;

    -- Writing task --------------------------------------------------------
    if v_mod ? 'writing' and not exists (select 1 from public.writing_tasks wt where wt.module_id = v_mod_id) then
      insert into public.writing_tasks (module_id, title, prompt, format, word_min, word_max, outline, xp_reward)
      values (
        v_mod_id,
        v_mod->'writing'->>'title',
        v_mod->'writing'->>'prompt',
        v_mod->'writing'->>'format',
        coalesce((v_mod->'writing'->>'wordMin')::int, 120),
        coalesce((v_mod->'writing'->>'wordMax')::int, 150),
        coalesce(v_mod->'writing'->'outline', '{}'::jsonb),
        coalesce((v_mod->'writing'->>'xp')::int, 45)
      );
    end if;

    v_mod_count := v_mod_count + 1;
  end loop;

  return jsonb_build_object(
    'modules', v_mod_count,
    'lessons', v_lesson_count,
    'practice_items', v_item_count
  );
end;
$$;

revoke all on function public.import_course(jsonb) from public;
revoke all on function public.import_modules(jsonb) from public;
revoke all on function public.import_course(jsonb) from anon, authenticated;
revoke all on function public.import_modules(jsonb) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Checkpoints + badges (small, upserted by natural key)
-- ---------------------------------------------------------------------------
create or replace function public.import_assessments(doc jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_course uuid;
  v_item   jsonb;
  v_n      int := 0;
begin
  select id into v_course from public.courses where slug = doc->>'course_slug';
  if v_course is null then
    raise exception 'Unknown course: %', doc->>'course_slug';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(doc->'checkpoints', '[]'::jsonb)) loop
    insert into public.checkpoints (
      course_id, module_id, code, title, timing_label, description, tasks, duration_minutes, skills
    ) values (
      v_course,
      (select m.id from public.modules m
        where m.course_id = v_course and m.module_number = (v_item->>'module')::int),
      v_item->>'code',
      v_item->>'title',
      v_item->>'timing',
      v_item->>'description',
      coalesce(v_item->'tasks', '[]'::jsonb),
      coalesce((v_item->>'minutes')::int, 30),
      coalesce(array(select (e)::skill_area from jsonb_array_elements_text(coalesce(v_item->'skills','[]'::jsonb)) e), '{}')
    )
    on conflict (code) do update
      set title = excluded.title,
          timing_label = excluded.timing_label,
          description = excluded.description,
          tasks = excluded.tasks,
          duration_minutes = excluded.duration_minutes,
          skills = excluded.skills,
          module_id = excluded.module_id;
    v_n := v_n + 1;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(doc->'badges', '[]'::jsonb)) loop
    insert into public.badges (code, title, description, icon, criteria, xp_reward)
    values (
      v_item->>'code', v_item->>'title', v_item->>'description',
      coalesce(v_item->>'icon', '🎖️'),
      coalesce(v_item->'criteria', '{}'::jsonb),
      coalesce((v_item->>'xp')::int, 50)
    )
    on conflict (code) do update
      set title = excluded.title,
          description = excluded.description,
          icon = excluded.icon,
          criteria = excluded.criteria,
          xp_reward = excluded.xp_reward;
  end loop;

  return jsonb_build_object('checkpoints', v_n);
end;
$$;

revoke all on function public.import_assessments(jsonb) from public;
revoke all on function public.import_assessments(jsonb) from anon, authenticated;
