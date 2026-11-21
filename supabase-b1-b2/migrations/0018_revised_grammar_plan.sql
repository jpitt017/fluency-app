-- ============================================================================
-- Migration 0018: Revised Grammar Plan (Weeks 1-4)
-- - practice_items.accepted_answers (valid grammatical variants)
-- - speaking_tasks.model_answer & speaking_tasks.b2_stretch
-- - Tuesday 5-item grammar drill support when grammar[0].items has >= 5 items
-- - Sunday delayed_recall_prompt in output block content
-- - Idempotent speaking_tasks & writing_tasks updates when no attempts exist
-- ============================================================================

alter table public.practice_items
  add column if not exists accepted_answers text[];

alter table public.speaking_tasks
  add column if not exists model_answer text,
  add column if not exists b2_stretch text;

create or replace function public.import_modules(doc jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course        uuid;
  v_mod           jsonb;
  v_mod_id        uuid;
  v_deck_id       uuid;
  v_deck_slug     text;
  v_deck_title    text;
  v_lesson        jsonb;
  v_grammar       jsonb;
  v_input         jsonb;
  v_task          jsonb;
  v_v             jsonb;
  v_i             int;
  v_k             int;
  v_n             int;
  v_gcount        int;
  v_grammar_len   int;
  v_is_tue_pilot  boolean;
  v_lesson_id     uuid;
  v_lesson_num    int;
  v_mod_count     int := 0;
  v_lesson_count  int := 0;
  v_item_count    int := 0;
  v_audio_url     text;
  v_vocab_terms   text[];
  v_vocab_count   int := 0;
  v_has_gap_fill  boolean;
begin
  select id into v_course from public.courses where slug = doc->>'course_slug';
  if v_course is null then
    raise exception 'Unknown course: %', doc->>'course_slug';
  end if;

  for v_mod in select * from jsonb_array_elements(doc->'modules') loop
    v_n := (v_mod->>'number')::int;
    v_gcount := jsonb_array_length(coalesce(v_mod->'grammar', '[]'::jsonb));

    insert into public.modules (
      course_id, module_number, week_number, phase_label, title, summary, hours,
      lesson_start, lesson_end, grammar_focus, light_grammar_focus,
      vocabulary_topic, vocab_pack, skill_mix
    ) values (
      v_course, v_n, v_n, v_mod->>'phase', v_mod->>'title', v_mod->>'summary',
      coalesce((v_mod->>'hours')::int, 4),
      (v_n - 1) * 7 + 1, v_n * 7,
      coalesce(array(select g->>'name' from jsonb_array_elements(coalesce(v_mod->'grammar','[]'::jsonb)) g), '{}'),
      v_mod->>'lightGrammar',
      v_mod->>'vocabularyTopic',
      coalesce(v_mod->'vocabPack', '{}'::jsonb),
      coalesce(v_mod->'skillMix', '{}'::jsonb)
    )
    on conflict (course_id, module_number) do update
      set week_number = excluded.week_number,
          phase_label = excluded.phase_label,
          title = excluded.title,
          summary = excluded.summary,
          hours = excluded.hours,
          lesson_start = excluded.lesson_start,
          lesson_end = excluded.lesson_end,
          grammar_focus = excluded.grammar_focus,
          light_grammar_focus = excluded.light_grammar_focus,
          vocabulary_topic = excluded.vocabulary_topic,
          vocab_pack = excluded.vocab_pack,
          skill_mix = excluded.skill_mix
    returning id into v_mod_id;

    v_deck_slug := format('week-%s', v_n);
    v_deck_title := format('Week %s · %s', v_n, v_mod->>'vocabularyTopic');

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

    v_vocab_count := jsonb_array_length(coalesce(v_mod->'vocab', '[]'::jsonb));

    select coalesce(array_agg(elem->>'term'), '{}')
      into v_vocab_terms
      from jsonb_array_elements(coalesce(v_mod->'vocab', '[]'::jsonb)) elem;

    delete from public.lesson_vocab lv
     using public.vocab_items vi
     where lv.vocab_item_id = vi.id
       and vi.deck_id = v_deck_id
       and not (vi.term = any(v_vocab_terms))
       and not exists (select 1 from public.vocab_cards vc where vc.vocab_item_id = vi.id);

    delete from public.vocab_items vi
     where vi.deck_id = v_deck_id
       and not (vi.term = any(v_vocab_terms))
       and not exists (select 1 from public.vocab_cards vc where vc.vocab_item_id = vi.id);

    for v_i in 0 .. v_vocab_count - 1 loop
      v_v := v_mod->'vocab'->v_i;
      insert into public.vocab_items (
        deck_id, term, part_of_speech, ipa, definition, example, collocations,
        word_family, usage_note, sentence_prompt, gap_fill,
        translation_es, band, teaching_role, audio_ref, audio_url
      ) values (
        v_deck_id,
        v_v->>'term',
        coalesce(v_v->>'pos', 'phrase'),
        v_v->>'ipa',
        v_v->>'definition',
        v_v->>'example',
        coalesce(array(select jsonb_array_elements_text(coalesce(v_v->'collocations','[]'::jsonb))), '{}'),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_v->'wordFamily','[]'::jsonb))), '{}'),
        nullif(btrim(concat_ws(' ', v_v->>'note', v_v->>'ukUsNote')), ''),
        v_v->>'sentencePrompt',
        v_v->'gapFill',
        v_v->>'translation',
        coalesce((v_v->>'band')::cefr_level, 'B1'),
        nullif(v_v->>'useRole', ''),
        v_v->>'audioRef',
        v_v->>'audioUrl'
      )
      on conflict (deck_id, term) do update
        set part_of_speech = excluded.part_of_speech,
            definition = excluded.definition,
            example = excluded.example,
            collocations = excluded.collocations,
            word_family = excluded.word_family,
            usage_note = excluded.usage_note,
            sentence_prompt = excluded.sentence_prompt,
            gap_fill = excluded.gap_fill,
            translation_es = excluded.translation_es,
            ipa = excluded.ipa,
            band = excluded.band,
            teaching_role = excluded.teaching_role,
            audio_ref = excluded.audio_ref,
            audio_url = coalesce(excluded.audio_url, public.vocab_items.audio_url);
    end loop;

    select exists (
      select 1 from public.vocab_items vi
      where vi.deck_id = v_deck_id and vi.gap_fill is not null
    ) into v_has_gap_fill;

    v_grammar := coalesce(v_mod->'grammar'->0, '{}'::jsonb);
    v_grammar_len := jsonb_array_length(coalesce(v_grammar->'items', '[]'::jsonb));

    for v_lesson, v_i in
      select value, ordinality
      from jsonb_array_elements(v_mod->'lessons') with ordinality as t(value, ordinality)
    loop
      v_lesson_num := (v_n - 1) * 7 + v_i::int;
      v_is_tue_pilot := (v_i::int = 2 and v_grammar_len >= 5);

      insert into public.lessons (
        course_id, module_id, lesson_number, module_lesson_number,
        day_of_week, session_requirement, output_required,
        title, objective, can_do, grammar_point_key, grammar_point, explanation,
        primary_skill, duration_minutes, xp_reward
      ) values (
        v_course, v_mod_id, v_lesson_num, v_i::int,
        v_lesson->>'dayOfWeek',
        coalesce(v_lesson->>'requirement', 'optional'),
        coalesce((v_lesson->>'outputRequired')::boolean, false),
        v_lesson->>'title',
        v_lesson->>'objective',
        v_lesson->>'canDo',
        v_grammar->>'key',
        v_grammar->>'name',
        coalesce(v_lesson->>'explanation', v_grammar->>'explanation'),
        coalesce((v_lesson->>'skill')::skill_area, 'grammar'),
        coalesce((v_lesson->>'minutes')::int, 15),
        coalesce((v_lesson->>'xp')::int, case when coalesce((v_lesson->>'outputRequired')::boolean, false) then 35 else 20 end)
      )
      on conflict (course_id, lesson_number) do update
        set module_id = excluded.module_id,
            module_lesson_number = excluded.module_lesson_number,
            day_of_week = excluded.day_of_week,
            session_requirement = excluded.session_requirement,
            output_required = excluded.output_required,
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

      if not exists (select 1 from public.practice_attempts pa where pa.lesson_id = v_lesson_id) then
        delete from public.lesson_vocab where lesson_id = v_lesson_id;
      end if;

      if v_i::int = 1 and v_has_gap_fill then
        insert into public.lesson_vocab (lesson_id, vocab_item_id, sort_order)
        select v_lesson_id, vi.id, ord.idx::int
        from jsonb_array_elements(coalesce(v_mod->'vocab', '[]'::jsonb)) with ordinality as ord(elem, idx)
        join public.vocab_items vi
          on vi.deck_id = v_deck_id and vi.term = ord.elem->>'term'
        on conflict do nothing;
      else
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
        where it.total > 0 and it.idx = ((v_i::int - 1 + k - 1) % it.total)
        on conflict do nothing;
      end if;

      insert into public.lesson_blocks (lesson_id, block_kind, sort_order, minutes, title, content)
      values
        (v_lesson_id, 'warm_up', 1, case when v_is_tue_pilot then 2 else 3 end, 'Spaced-repetition warm-up',
         jsonb_build_object(
           'summary', format('Recall cards from %s before today''s session.', v_deck_title),
           'card_count', 8, 'deck_slug', v_deck_slug,
           'review_ladder_days', jsonb_build_array(1, 3, 7, 14, 30))),
        (v_lesson_id, 'input', 2, case when v_is_tue_pilot then 3 else 5 end,
         case when v_i::int = 1 then 'Vocabulary Pack: ' || coalesce(v_mod->>'vocabularyTopic', v_mod->>'title')
              else 'Model: ' || coalesce(v_grammar->>'name', 'Language input') end,
         jsonb_build_object(
           'summary', coalesce(v_grammar->>'explanation', v_lesson->>'objective'),
           'key_points', coalesce(v_grammar->'keyPoints', '[]'::jsonb),
           'model_example', coalesce(v_grammar->>'example', ''),
           'input_kind', coalesce(v_lesson->>'input', 'reading'))),
        (v_lesson_id, 'practice', 3, 5, 'Guided practice',
         jsonb_build_object(
           'summary', case when v_is_tue_pilot
                           then format('Five focused checks on %s.', coalesce(v_grammar->>'name', 'target language'))
                           else format('Focused checks on %s and this week''s collocations.', coalesce(v_grammar->>'name', 'target language')) end,
           'item_count', case when v_i::int = 1 and v_has_gap_fill then v_vocab_count + 2
                              when v_is_tue_pilot then 5
                              else 8 end,
           'mix', case when v_i::int = 1 and v_has_gap_fill
                       then jsonb_build_object('grammar', 2, 'vocabulary', v_vocab_count)
                       when v_is_tue_pilot
                       then jsonb_build_object('grammar', 5, 'vocabulary', 0)
                       else jsonb_build_object('grammar', 2, 'vocabulary', 6) end,
           'answer_mode', 'instant')),
        (v_lesson_id, 'output', 4, case when coalesce(v_lesson->>'skill', 'speaking') = 'writing' then 15 else 5 end,
         'Produce: ' || coalesce(v_lesson->>'outputTitle', v_lesson->>'title'),
         jsonb_build_object(
           'summary', coalesce(v_lesson->>'output', v_lesson->>'objective'),
           'can_do', v_lesson->>'canDo',
           'mode', coalesce(v_lesson->>'skill', 'speaking'),
           'target_seconds', coalesce((v_lesson->>'targetSeconds')::int, 55),
           'word_range', coalesce(v_lesson->'wordRange', jsonb_build_array(120, 150)),
           'delayed_recall_prompt', v_lesson->>'delayedRecallPrompt')),
        (v_lesson_id, 'feedback', 5, 2, 'Feedback & self-check',
         jsonb_build_object(
           'summary', 'AI guidance highlights patterns and alternatives; your teacher assesses pronunciation and confirms readiness in live lessons.',
           'can_do', v_lesson->>'canDo',
           'rubric', case when coalesce(v_lesson->>'skill', 'speaking') = 'writing'
                          then jsonb_build_array('task response', 'organisation', 'grammar accuracy', 'vocabulary range', 'style')
                          else jsonb_build_array('task achievement', 'vocabulary range', 'grammar accuracy', 'coherence')
                     end))
      on conflict (lesson_id, sort_order) do update
        set block_kind = excluded.block_kind,
            minutes = excluded.minutes,
            title = excluded.title,
            content = excluded.content;

      if not exists (select 1 from public.practice_attempts pa where pa.lesson_id = v_lesson_id) then
        delete from public.practice_items where lesson_id = v_lesson_id;

        if v_i::int = 1 and v_has_gap_fill then
          insert into public.practice_items (
            lesson_id, kind, sort_order, prompt, options, answer, explanation, grammar_point, difficulty
          )
          select
            v_lesson_id,
            'gap_fill',
            lv.sort_order::smallint,
            vi.gap_fill->>'prompt',
            coalesce(vi.gap_fill->'options', '[]'::jsonb),
            vi.gap_fill->>'answer',
            vi.gap_fill->>'explanation',
            v_mod->>'vocabularyTopic',
            1
          from public.lesson_vocab lv
          join public.vocab_items vi on vi.id = lv.vocab_item_id
          where lv.lesson_id = v_lesson_id
            and vi.gap_fill is not null
          order by lv.sort_order;

          if v_grammar_len > 0 then
            insert into public.practice_items (
              lesson_id, kind, sort_order, prompt, options, answer, accepted_answers, explanation, grammar_point, difficulty
            )
            select v_lesson_id, 'multiple_choice', (v_vocab_count + gs.k)::smallint,
                   (v_grammar->'items'->((gs.k - 1) % v_grammar_len))->>'prompt',
                   coalesce((v_grammar->'items'->((gs.k - 1) % v_grammar_len))->'options', '[]'::jsonb),
                   (v_grammar->'items'->((gs.k - 1) % v_grammar_len))->>'answer',
                   case when (v_grammar->'items'->((gs.k - 1) % v_grammar_len)) ? 'acceptedAnswers'
                        then array(select jsonb_array_elements_text((v_grammar->'items'->((gs.k - 1) % v_grammar_len))->'acceptedAnswers'))
                        else null end,
                   (v_grammar->'items'->((gs.k - 1) % v_grammar_len))->>'explanation',
                   v_grammar->>'name',
                   coalesce(((v_grammar->'items'->((gs.k - 1) % v_grammar_len))->>'difficulty')::smallint, 1)
            from generate_series(1, 2) as gs(k);
          end if;
        elsif v_is_tue_pilot then
          insert into public.practice_items (
            lesson_id, kind, sort_order, prompt, options, answer, accepted_answers, explanation, grammar_point, difficulty
          )
          select v_lesson_id, 'multiple_choice', gs.k::smallint,
                 (v_grammar->'items'->(gs.k - 1))->>'prompt',
                 coalesce((v_grammar->'items'->(gs.k - 1))->'options', '[]'::jsonb),
                 (v_grammar->'items'->(gs.k - 1))->>'answer',
                 case when (v_grammar->'items'->(gs.k - 1)) ? 'acceptedAnswers'
                      then array(select jsonb_array_elements_text((v_grammar->'items'->(gs.k - 1))->'acceptedAnswers'))
                      else null end,
                 (v_grammar->'items'->(gs.k - 1))->>'explanation',
                 v_grammar->>'name',
                 coalesce(((v_grammar->'items'->(gs.k - 1))->>'difficulty')::smallint, 1)
          from generate_series(1, 5) as gs(k);
        else
          if v_grammar_len > 0 then
            insert into public.practice_items (
              lesson_id, kind, sort_order, prompt, options, answer, accepted_answers, explanation, grammar_point, difficulty
            )
            select v_lesson_id, 'multiple_choice', gs.k,
                   (case when v_gcount > 1 and gs.k = 2 and v_i in (2, 7)
                         then v_mod->'grammar'->1->'items'->((v_i::int) % jsonb_array_length(v_mod->'grammar'->1->'items'))
                         else v_grammar->'items'->((v_i::int - 1 + gs.k - 1) % v_grammar_len)
                    end)->>'prompt',
                   coalesce((case when v_gcount > 1 and gs.k = 2 and v_i in (2, 7)
                         then v_mod->'grammar'->1->'items'->((v_i::int) % jsonb_array_length(v_mod->'grammar'->1->'items'))
                         else v_grammar->'items'->((v_i::int - 1 + gs.k - 1) % v_grammar_len)
                    end)->'options', '[]'::jsonb),
                   (case when v_gcount > 1 and gs.k = 2 and v_i in (2, 7)
                         then v_mod->'grammar'->1->'items'->((v_i::int) % jsonb_array_length(v_mod->'grammar'->1->'items'))
                         else v_grammar->'items'->((v_i::int - 1 + gs.k - 1) % v_grammar_len)
                    end)->>'answer',
                   case when (case when v_gcount > 1 and gs.k = 2 and v_i in (2, 7)
                         then v_mod->'grammar'->1->'items'->((v_i::int) % jsonb_array_length(v_mod->'grammar'->1->'items'))
                         else v_grammar->'items'->((v_i::int - 1 + gs.k - 1) % v_grammar_len)
                    end) ? 'acceptedAnswers'
                        then array(select jsonb_array_elements_text((case when v_gcount > 1 and gs.k = 2 and v_i in (2, 7)
                              then v_mod->'grammar'->1->'items'->((v_i::int) % jsonb_array_length(v_mod->'grammar'->1->'items'))
                              else v_grammar->'items'->((v_i::int - 1 + gs.k - 1) % v_grammar_len)
                         end)->'acceptedAnswers'))
                        else null end,
                   (case when v_gcount > 1 and gs.k = 2 and v_i in (2, 7)
                         then v_mod->'grammar'->1->'items'->((v_i::int) % jsonb_array_length(v_mod->'grammar'->1->'items'))
                         else v_grammar->'items'->((v_i::int - 1 + gs.k - 1) % v_grammar_len)
                    end)->>'explanation',
                   v_grammar->>'name',
                   coalesce(((case when v_gcount > 1 and gs.k = 2 and v_i in (2, 7)
                         then v_mod->'grammar'->1->'items'->((v_i::int) % jsonb_array_length(v_mod->'grammar'->1->'items'))
                         else v_grammar->'items'->((v_i::int - 1 + gs.k - 1) % v_grammar_len)
                    end)->>'difficulty')::smallint, 1)
            from generate_series(1, 2) as gs(k);
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
        end if;

        select count(*) into v_k from public.practice_items where lesson_id = v_lesson_id;
        v_item_count := v_item_count + v_k;
      end if;
    end loop;

    if not exists (select 1 from public.content_inputs ci where ci.module_id = v_mod_id) then
      for v_input in select * from jsonb_array_elements(coalesce(v_mod->'inputs', '[]'::jsonb)) loop
        v_audio_url := case
          when coalesce(v_input->>'audioStatus', '') = 'bundled' and v_input->>'audioRef' is not null
          then '/audio/' || (v_input->>'audioRef')
          else v_input->>'audioUrl'
        end;

        insert into public.content_inputs (
          module_id, lesson_id, kind, title, source_label, accent, speaker_accents,
          audio_url, body, duration_seconds, word_count, questions
        )
        select
          v_mod_id,
          (select l.id from public.lessons l
            where l.module_id = v_mod_id
              and l.module_lesson_number = coalesce((v_input->>'lesson')::int, 3)
            limit 1),
          (v_input->>'kind')::input_kind,
          v_input->>'title',
          coalesce(v_input->>'source', 'Studio original'),
          v_input->>'accent',
          coalesce(v_input->'speaker_accents', '[]'::jsonb),
          v_audio_url,
          v_input->>'body',
          (v_input->>'seconds')::int,
          array_length(regexp_split_to_array(btrim(v_input->>'body'), '\s+'), 1),
          coalesce(v_input->'questions', '[]'::jsonb);
      end loop;
    end if;

    if not exists (select 1 from public.speaking_tasks st where st.module_id = v_mod_id) then
      for v_task in select * from jsonb_array_elements(coalesce(v_mod->'speaking', '[]'::jsonb)) loop
        insert into public.speaking_tasks (
          module_id, kind, title, prompt, target_seconds, useful_phrases,
          target_linkers, target_terms, model_answer, b2_stretch, rubric, xp_reward
        ) values (
          v_mod_id,
          coalesce((v_task->>'kind')::task_kind, 'prompt_card'),
          v_task->>'title',
          v_task->>'prompt',
          coalesce((v_task->>'seconds')::int, 120),
          coalesce(array(select jsonb_array_elements_text(coalesce(v_task->'phrases','[]'::jsonb))), '{}'),
          coalesce(array(select jsonb_array_elements_text(coalesce(v_task->'linkers','[]'::jsonb))), '{}'),
          coalesce(array(select jsonb_array_elements_text(coalesce(v_task->'terms','[]'::jsonb))), '{}'),
          v_task->>'modelAnswer',
          v_task->>'b2Stretch',
          jsonb_build_object(
            'task_achievement', 0.25, 'lexical_range', 0.25,
            'grammar_accuracy', 0.25, 'coherence', 0.25),
          coalesce((v_task->>'xp')::int, 40)
        );
      end loop;
    else
      for v_task in select * from jsonb_array_elements(coalesce(v_mod->'speaking', '[]'::jsonb)) limit 1 loop
        update public.speaking_tasks st
           set kind = coalesce((v_task->>'kind')::task_kind, st.kind),
               title = v_task->>'title',
               prompt = v_task->>'prompt',
               target_seconds = coalesce((v_task->>'seconds')::int, st.target_seconds),
               useful_phrases = coalesce(array(select jsonb_array_elements_text(coalesce(v_task->'phrases','[]'::jsonb))), st.useful_phrases),
               target_linkers = coalesce(array(select jsonb_array_elements_text(coalesce(v_task->'linkers','[]'::jsonb))), st.target_linkers),
               target_terms = coalesce(array(select jsonb_array_elements_text(coalesce(v_task->'terms','[]'::jsonb))), st.target_terms),
               model_answer = coalesce(v_task->>'modelAnswer', st.model_answer),
               b2_stretch = coalesce(v_task->>'b2Stretch', st.b2_stretch)
         where st.module_id = v_mod_id
           and not exists (select 1 from public.speaking_attempts sa where sa.task_id = st.id);
      end loop;
    end if;

    if v_mod ? 'writing' then
      if not exists (select 1 from public.writing_tasks wt where wt.module_id = v_mod_id) then
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
      else
        update public.writing_tasks wt
           set title = v_mod->'writing'->>'title',
               prompt = v_mod->'writing'->>'prompt',
               format = v_mod->'writing'->>'format',
               word_min = coalesce((v_mod->'writing'->>'wordMin')::int, wt.word_min),
               word_max = coalesce((v_mod->'writing'->>'wordMax')::int, wt.word_max),
               outline = coalesce(v_mod->'writing'->'outline', wt.outline)
         where wt.module_id = v_mod_id
           and not exists (select 1 from public.writing_submissions ws where ws.task_id = wt.id);
      end if;
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
