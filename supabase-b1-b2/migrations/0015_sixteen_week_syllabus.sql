-- ============================================================================
-- Migration 0015: 16-Week × 7-Day B1 → B2 Syllabus, Output-Before-Progress
-- Gating, Honest Speaking Support (no automated pronunciation score),
-- Teacher Dashboard RBAC/RPCs, and Week 16 Dynamic Error-Log Review.
-- ============================================================================

-- 1. Schema extensions -------------------------------------------------------
alter table public.courses
  add column if not exists min_hours             int not null default 55,
  add column if not exists live_lessons_per_week jsonb not null default '{"count":2,"minutes":[60,55]}'::jsonb,
  add column if not exists positioning           text;

alter table public.modules
  add column if not exists week_number         int,
  add column if not exists phase_label         text,
  add column if not exists light_grammar_focus text;

alter table public.lessons
  add column if not exists day_of_week         text,
  add column if not exists session_requirement text not null default 'optional',
  add column if not exists output_required     boolean not null default false;

alter table public.vocab_items
  add column if not exists word_family text[] not null default '{}',
  add column if not exists audio_ref   text;

alter table public.profiles
  add column if not exists role text not null default 'learner';

do $$
begin
  alter table public.profiles
    add constraint profiles_role_check check (role in ('learner', 'teacher', 'admin'));
exception when duplicate_object then null;
end $$;

-- Keep role uneditable by authenticated clients (never allow self-escalation).
revoke update on public.profiles from authenticated;
grant update (
  full_name, avatar_url, daily_word_goal, timezone, onboarding_completed, placement_result
) on public.profiles to authenticated;

-- Teacher confirmation & override fields on output and checkpoints
alter table public.speaking_attempts
  add column if not exists teacher_status             text check (teacher_status in ('pending', 'confirmed', 'needs_work', 'overridden')),
  add column if not exists teacher_notes              text,
  add column if not exists teacher_pronunciation_note text,
  add column if not exists teacher_reviewed_at        timestamptz,
  add column if not exists teacher_reviewed_by        uuid references auth.users(id) on delete set null;

alter table public.writing_submissions
  add column if not exists teacher_status      text check (teacher_status in ('pending', 'confirmed', 'needs_work', 'overridden')),
  add column if not exists teacher_notes       text,
  add column if not exists teacher_reviewed_at timestamptz,
  add column if not exists teacher_reviewed_by uuid references auth.users(id) on delete set null;

alter table public.checkpoint_attempts
  add column if not exists teacher_status             text check (teacher_status in ('pending', 'confirmed', 'needs_work', 'overridden')),
  add column if not exists teacher_notes              text,
  add column if not exists teacher_readiness_decision text check (teacher_readiness_decision in ('ready_for_b2_exam_prep', 'named_next_step')),
  add column if not exists teacher_reviewed_at        timestamptz,
  add column if not exists teacher_reviewed_by        uuid references auth.users(id) on delete set null;

-- 2. Clean out legacy 8-module curriculum rows if no learner attempts exist --
do $$
declare
  v_course uuid;
begin
  select id into v_course from public.courses where slug = 'english-b1-b2';
  if v_course is not null
     and not exists (select 1 from public.lesson_progress)
     and not exists (select 1 from public.practice_attempts)
     and not exists (select 1 from public.speaking_attempts)
     and not exists (select 1 from public.writing_submissions)
     and not exists (select 1 from public.vocab_cards) then
    delete from public.content_inputs where module_id in (select id from public.modules where course_id = v_course);
    delete from public.speaking_tasks where module_id in (select id from public.modules where course_id = v_course);
    delete from public.writing_tasks where module_id in (select id from public.modules where course_id = v_course);
    delete from public.lessons where course_id = v_course;
    delete from public.vocab_decks where course_id = v_course;
    delete from public.modules where course_id = v_course;
    delete from public.checkpoints where course_id = v_course;
  end if;
end $$;

-- 3. Update curriculum importer functions for 16 weeks × 7 days -----------
create or replace function public.import_course(doc jsonb)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.courses (
    slug, title, subtitle, description, level_from, level_to, total_hours,
    min_hours, weekly_hours, duration_weeks, daily_minutes_min, daily_minutes_max,
    live_lessons_per_week, positioning, daily_flow, skill_balance, published
  ) values (
    doc->>'slug',
    doc->>'title',
    doc->>'subtitle',
    doc->>'description',
    coalesce((doc->>'level_from')::cefr_level, 'B1'),
    coalesce((doc->>'level_to')::cefr_level, 'B2'),
    coalesce((doc->>'total_hours')::int, 63),
    coalesce((doc->>'min_hours')::int, 55),
    (doc->>'weekly_hours')::numeric,
    coalesce((doc->>'duration_weeks')::int, 16),
    coalesce((doc->>'daily_minutes_min')::int, 15),
    coalesce((doc->>'daily_minutes_max')::int, 30),
    coalesce(doc->'live_lessons_per_week', '{"count":2,"minutes":[60,55]}'::jsonb),
    doc->>'positioning',
    coalesce(doc->'daily_flow', '[]'::jsonb),
    coalesce(doc->'skill_balance', '[]'::jsonb),
    coalesce((doc->>'published')::boolean, true)
  )
  on conflict (slug) do update
    set title = excluded.title,
        subtitle = excluded.subtitle,
        description = excluded.description,
        total_hours = excluded.total_hours,
        min_hours = excluded.min_hours,
        weekly_hours = excluded.weekly_hours,
        duration_weeks = excluded.duration_weeks,
        daily_minutes_min = excluded.daily_minutes_min,
        daily_minutes_max = excluded.daily_minutes_max,
        live_lessons_per_week = excluded.live_lessons_per_week,
        positioning = excluded.positioning,
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
  v_audio_url    text;
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
      vocabulary_topic, skill_mix
    ) values (
      v_course, v_n, v_n, v_mod->>'phase', v_mod->>'title', v_mod->>'summary',
      coalesce((v_mod->>'hours')::int, 4),
      (v_n - 1) * 7 + 1, v_n * 7,
      coalesce(array(select g->>'name' from jsonb_array_elements(coalesce(v_mod->'grammar','[]'::jsonb)) g), '{}'),
      v_mod->>'lightGrammar',
      v_mod->>'vocabularyTopic',
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
          skill_mix = excluded.skill_mix
    returning id into v_mod_id;

    -- Vocabulary deck (British English en-GB audio refs) -------------------
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

    for v_i in 0 .. jsonb_array_length(coalesce(v_mod->'vocab', '[]'::jsonb)) - 1 loop
      insert into public.vocab_items (
        deck_id, term, part_of_speech, ipa, definition, example, collocations,
        word_family, translation_es, band, audio_ref
      ) values (
        v_deck_id,
        v_mod->'vocab'->v_i->>'term',
        coalesce(v_mod->'vocab'->v_i->>'pos', 'phrase'),
        v_mod->'vocab'->v_i->>'ipa',
        v_mod->'vocab'->v_i->>'definition',
        v_mod->'vocab'->v_i->>'example',
        coalesce(array(select jsonb_array_elements_text(coalesce(v_mod->'vocab'->v_i->'collocations','[]'::jsonb))), '{}'),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_mod->'vocab'->v_i->'wordFamily','[]'::jsonb))), '{}'),
        v_mod->'vocab'->v_i->>'translation',
        coalesce((v_mod->'vocab'->v_i->>'band')::cefr_level, 'B1'),
        v_mod->'vocab'->v_i->>'audioRef'
      )
      on conflict (deck_id, term) do update
        set definition = excluded.definition,
            example = excluded.example,
            collocations = excluded.collocations,
            word_family = excluded.word_family,
            translation_es = excluded.translation_es,
            ipa = excluded.ipa,
            band = excluded.band,
            audio_ref = excluded.audio_ref;
    end loop;

    -- 7 Daily Sessions (Mon–Sun) ------------------------------------------
    for v_lesson, v_i in
      select value, ordinality
      from jsonb_array_elements(v_mod->'lessons') with ordinality as t(value, ordinality)
    loop
      v_lesson_num := (v_n - 1) * 7 + v_i::int;
      v_gi := case when v_i = 2 and v_gcount > 1 then 1 else 0 end;
      v_grammar := coalesce(v_mod->'grammar'->0, '{}'::jsonb);

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

      insert into public.lesson_blocks (lesson_id, block_kind, sort_order, minutes, title, content)
      values
        (v_lesson_id, 'warm_up', 1, 3, 'Spaced-repetition warm-up',
         jsonb_build_object(
           'summary', format('Recall cards from %s before today''s session.', v_deck_title),
           'card_count', 8, 'deck_slug', v_deck_slug,
           'review_ladder_days', jsonb_build_array(1, 3, 7, 14, 30))),
        (v_lesson_id, 'input', 2, 5, 'Model: ' || coalesce(v_grammar->>'name', 'Language input'),
         jsonb_build_object(
           'summary', coalesce(v_grammar->>'explanation', v_lesson->>'objective'),
           'key_points', coalesce(v_grammar->'keyPoints', '[]'::jsonb),
           'model_example', coalesce(v_grammar->>'example', ''),
           'input_kind', coalesce(v_lesson->>'input', 'reading'))),
        (v_lesson_id, 'practice', 3, 5, 'Guided practice',
         jsonb_build_object(
           'summary', format('Focused checks on %s and this week''s collocations.', coalesce(v_grammar->>'name', 'target language')),
           'item_count', 8,
           'mix', jsonb_build_object('grammar', 2, 'vocabulary', 6),
           'answer_mode', 'instant')),
        (v_lesson_id, 'output', 4, case when coalesce(v_lesson->>'skill', 'speaking') = 'writing' then 15 else 5 end,
         'Produce: ' || coalesce(v_lesson->>'outputTitle', v_lesson->>'title'),
         jsonb_build_object(
           'summary', coalesce(v_lesson->>'output', v_lesson->>'objective'),
           'can_do', v_lesson->>'canDo',
           'mode', coalesce(v_lesson->>'skill', 'speaking'),
           'target_seconds', coalesce((v_lesson->>'targetSeconds')::int, 90),
           'word_range', coalesce(v_lesson->'wordRange', jsonb_build_array(120, 150)))),
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

        if jsonb_array_length(coalesce(v_grammar->'items', '[]'::jsonb)) > 0 then
          insert into public.practice_items (
            lesson_id, kind, sort_order, prompt, options, answer, explanation, grammar_point, difficulty
          )
          select v_lesson_id, 'multiple_choice', gs.k,
                 (case when v_gcount > 1 and gs.k = 2 and v_i in (2, 7)
                       then v_mod->'grammar'->1->'items'->((v_i::int) % jsonb_array_length(v_mod->'grammar'->1->'items'))
                       else v_grammar->'items'->((v_i::int - 1 + gs.k - 1) % jsonb_array_length(v_grammar->'items'))
                  end)->>'prompt',
                 coalesce((case when v_gcount > 1 and gs.k = 2 and v_i in (2, 7)
                       then v_mod->'grammar'->1->'items'->((v_i::int) % jsonb_array_length(v_mod->'grammar'->1->'items'))
                       else v_grammar->'items'->((v_i::int - 1 + gs.k - 1) % jsonb_array_length(v_grammar->'items'))
                  end)->'options', '[]'::jsonb),
                 (case when v_gcount > 1 and gs.k = 2 and v_i in (2, 7)
                       then v_mod->'grammar'->1->'items'->((v_i::int) % jsonb_array_length(v_mod->'grammar'->1->'items'))
                       else v_grammar->'items'->((v_i::int - 1 + gs.k - 1) % jsonb_array_length(v_grammar->'items'))
                  end)->>'answer',
                 (case when v_gcount > 1 and gs.k = 2 and v_i in (2, 7)
                       then v_mod->'grammar'->1->'items'->((v_i::int) % jsonb_array_length(v_mod->'grammar'->1->'items'))
                       else v_grammar->'items'->((v_i::int - 1 + gs.k - 1) % jsonb_array_length(v_grammar->'items'))
                  end)->>'explanation',
                 v_grammar->>'name',
                 coalesce(((case when v_gcount > 1 and gs.k = 2 and v_i in (2, 7)
                       then v_mod->'grammar'->1->'items'->((v_i::int) % jsonb_array_length(v_mod->'grammar'->1->'items'))
                       else v_grammar->'items'->((v_i::int - 1 + gs.k - 1) % jsonb_array_length(v_grammar->'items'))
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

        select count(*) into v_k from public.practice_items where lesson_id = v_lesson_id;
        v_item_count := v_item_count + v_k;
      end if;
    end loop;

    -- Listening / reading inputs -----------------------------------------
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

    -- Speaking tasks (NO automated pronunciation scoring) -----------------
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
            'task_achievement', 0.25, 'lexical_range', 0.25,
            'grammar_accuracy', 0.25, 'coherence', 0.25),
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

-- 4. Output-Before-Progress gating + streak advancement ---------------------
create or replace function public.enforce_output_before_progress()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lesson      public.lessons;
  v_has_output  boolean := coalesce(new.output_submitted, false);
begin
  if not v_has_output then
    select (
      exists (
        select 1 from public.speaking_attempts sa
        where sa.user_id = new.user_id and sa.lesson_id = new.lesson_id
      )
      or exists (
        select 1 from public.writing_submissions ws
        where ws.user_id = new.user_id and ws.lesson_id = new.lesson_id
      )
    ) into v_has_output;

    if v_has_output then
      new.output_submitted := true;
    end if;
  end if;

  if new.status = 'completed' then
    select * into v_lesson from public.lessons where id = new.lesson_id;
    if found and v_lesson.output_required and not coalesce(new.output_submitted, false) then
      raise exception 'Output before progress: complete the required speaking or writing task before marking this session complete.'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lesson_progress_output_gate on public.lesson_progress;
create trigger lesson_progress_output_gate
  before insert or update on public.lesson_progress
  for each row execute function public.enforce_output_before_progress();

create or replace function public.reward_lesson_completion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lesson public.lessons;
begin
  if new.status <> 'completed' or coalesce(old.status, 'not_started'::progress_status) = 'completed' then
    return new;
  end if;

  select * into v_lesson from public.lessons where id = new.lesson_id;
  if not found then
    return new;
  end if;

  perform public.award_xp(new.user_id, 'lesson', v_lesson.xp_reward, 'lesson', v_lesson.id, v_lesson.title);
  perform public.touch_skill(new.user_id, v_lesson.primary_skill, 2.5, v_lesson.xp_reward);

  -- Output before progress: streak advances only when output is submitted.
  if coalesce(new.output_submitted, false) then
    perform public.record_activity(new.user_id);
  end if;

  update public.enrollments e
     set current_lesson_number = greatest(e.current_lesson_number, v_lesson.lesson_number + 1)
   where e.user_id = new.user_id
     and e.course_id = v_lesson.course_id;

  return new;
end;
$$;

-- 5. Updated curriculum outline, lesson loader (with Week 16 error-log), & dashboard
create or replace function public.get_curriculum_outline()
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with course_row as (
    select * from public.courses where published order by total_hours desc limit 1
  ),
  week_listening as (
    select count(distinct l.module_id)::int as cnt
    from public.lesson_progress lp
    join public.lessons l on l.id = lp.lesson_id
    where lp.user_id = auth.uid()
      and lp.status = 'completed'
      and l.primary_skill = 'listening'
  ),
  week_reading as (
    select count(distinct l.module_id)::int as cnt
    from public.lesson_progress lp
    join public.lessons l on l.id = lp.lesson_id
    where lp.user_id = auth.uid()
      and lp.status = 'completed'
      and l.primary_skill = 'reading'
  )
  select jsonb_build_object(
    'course', (select to_jsonb(c) from course_row c),
    'modules', coalesce((
      select jsonb_agg(module_json order by module_number)
      from (
        select m.module_number,
               jsonb_build_object(
                 'id', m.id,
                 'number', m.module_number,
                 'week_number', coalesce(m.week_number, m.module_number),
                 'phase', m.phase_label,
                 'title', m.title,
                 'summary', m.summary,
                 'topic', m.vocabulary_topic,
                 'grammar', m.grammar_focus,
                 'light_grammar', m.light_grammar_focus,
                 'hours', m.hours,
                 'lesson_start', m.lesson_start,
                 'lesson_end', m.lesson_end,
                 'lessons', coalesce((
                   select jsonb_agg(jsonb_build_object(
                     'id', l.id,
                     'number', l.lesson_number,
                     'module_lesson', l.module_lesson_number,
                     'day_of_week', l.day_of_week,
                     'requirement', l.session_requirement,
                     'output_required', l.output_required,
                     'title', l.title,
                     'objective', l.objective,
                     'can_do', l.can_do,
                     'skill', l.primary_skill,
                     'minutes', l.duration_minutes,
                     'status', coalesce(lp.status::text, 'not_started'),
                     'output_submitted', coalesce(lp.output_submitted, false),
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
        where m.course_id = (select id from course_row)
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
    'listening_weeks_completed', coalesce((select cnt from week_listening), 0),
    'reading_weeks_completed', coalesce((select cnt from week_reading), 0),
    'checkpoints', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', cp.code, 'title', cp.title, 'timing', cp.timing_label,
        'description', cp.description, 'module', m.module_number,
        'status', coalesce(ca.status::text, 'not_started'),
        'teacher_status', ca.teacher_status,
        'teacher_readiness_decision', ca.teacher_readiness_decision,
        'completed_at', ca.completed_at
      ) order by m.module_number)
      from public.checkpoints cp
      left join public.modules m on m.id = cp.module_id
      left join public.checkpoint_attempts ca
        on ca.checkpoint_id = cp.id and ca.user_id = auth.uid()
    ), '[]'::jsonb)
  );
$function$;

create or replace function public.get_lesson(p_lesson_number integer)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'lesson', to_jsonb(l) - 'course_id',
    'module', jsonb_build_object(
      'id', m.id,
      'number', m.module_number,
      'week_number', coalesce(m.week_number, m.module_number),
      'phase', m.phase_label,
      'title', m.title,
      'summary', m.summary,
      'topic', m.vocabulary_topic,
      'grammar', m.grammar_focus,
      'light_grammar', m.light_grammar_focus,
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
        and ci.kind = case
          when l.primary_skill in ('listening', 'speaking') then 'listening'::input_kind
          else 'reading'::input_kind
        end
      order by (ci.lesson_id = l.id) desc, ci.created_at
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
    ),
    'personal_error_log', case
      when coalesce(m.week_number, m.module_number) = 16 and auth.uid() is not null then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', erc.id,
          'category', erc.category::text,
          'incorrect_sentence', erc.prompt_sentence,
          'target_sentence', erc.corrected_sentence,
          'explanation', erc.explanation,
          'occurrence_count', erc.occurrence_count,
          'mastered', erc.mastered
        ) order by erc.mastered asc, erc.occurrence_count desc, erc.created_at desc)
        from (
          select id, category, prompt_sentence, corrected_sentence, explanation, occurrence_count, mastered, created_at
          from public.error_review_cards
          where user_id = auth.uid()
          order by mastered asc, occurrence_count desc, created_at desc
          limit 8
        ) erc
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  )
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.lesson_number = p_lesson_number;
$function$;

create or replace function public.get_learner_dashboard()
returns jsonb
language sql
stable
as $function$
  with me as (
    select * from public.profiles where id = auth.uid()
  ),
  next_lesson as (
    select l.id, l.lesson_number, l.title, l.can_do, l.day_of_week, m.title as module_title,
           coalesce(m.week_number, m.module_number) as week_number
    from public.enrollments e
    join public.lessons l on l.course_id = e.course_id and l.lesson_number = e.current_lesson_number
    join public.modules m on m.id = l.module_id
    where e.user_id = auth.uid()
    limit 1
  )
  select jsonb_build_object(
    'profile', to_jsonb(me) - 'email',
    'role', me.role,
    'xp_total', me.xp_total,
    'learner_band', me.learner_band,
    'streak_days', me.streak_days,
    'skills', coalesce((
      select jsonb_object_agg(sl.skill, jsonb_build_object('score', sl.score, 'lessons', sl.lessons_completed))
      from public.skill_levels sl where sl.user_id = auth.uid()
    ), '{}'::jsonb),
    'due_cards', (select count(*) from public.vocab_cards c
                  where c.user_id = auth.uid() and not c.suspended and c.due_at <= now()),
    'lessons_completed', (select count(*) from public.lesson_progress lp
                          where lp.user_id = auth.uid() and lp.status = 'completed'),
    'next_lesson', (select to_jsonb(nl) from next_lesson nl),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object('code', b.code, 'title', b.title, 'earned_at', ub.earned_at))
      from public.user_badges ub join public.badges b on b.id = ub.badge_id
      where ub.user_id = auth.uid()
    ), '[]'::jsonb)
  )
  from me;
$function$;

-- 6. Teacher Dashboard RBAC + RPCs ------------------------------------------
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('teacher', 'admin')
  );
$$;

revoke all on function public.is_teacher() from public, anon;
grant execute on function public.is_teacher() to authenticated;

create or replace function public.teacher_get_roster()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'Teacher access required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(learner_row order by learner_row->>'full_name', learner_row->>'user_id')
    from (
      select jsonb_build_object(
        'user_id', p.id,
        'full_name', coalesce(p.full_name, split_part(coalesce(p.email, 'Learner'), '@', 1)),
        'email', p.email,
        'learner_band', p.learner_band,
        'streak_days', p.streak_days,
        'longest_streak', p.longest_streak,
        'last_active_on', p.last_active_on,
        'current_lesson_number', coalesce((
          select e.current_lesson_number from public.enrollments e
          where e.user_id = p.id order by e.started_at desc limit 1
        ), 1),
        'total_sessions_completed', (
          select count(*)::int from public.lesson_progress lp
          where lp.user_id = p.id and lp.status = 'completed'
        ),
        'listening_weeks', (
          select count(distinct l.module_id)::int
          from public.lesson_progress lp
          join public.lessons l on l.id = lp.lesson_id
          where lp.user_id = p.id and lp.status = 'completed' and l.primary_skill = 'listening'
        ),
        'reading_weeks', (
          select count(distinct l.module_id)::int
          from public.lesson_progress lp
          join public.lessons l on l.id = lp.lesson_id
          where lp.user_id = p.id and lp.status = 'completed' and l.primary_skill = 'reading'
        ),
        'weeks', coalesce((
          select jsonb_agg(jsonb_build_object(
            'week_number', coalesce(m.week_number, m.module_number),
            'title', m.title,
            'sessions_completed', (
              select count(*)::int from public.lesson_progress lp
              join public.lessons l on l.id = lp.lesson_id
              where lp.user_id = p.id and l.module_id = m.id and lp.status = 'completed'
            ),
            'wed_or_thu_done', exists (
              select 1 from public.lesson_progress lp
              join public.lessons l on l.id = lp.lesson_id
              where lp.user_id = p.id and l.module_id = m.id
                and l.day_of_week in ('Wed', 'Thu') and lp.status = 'completed'
            ),
            'fri_speaking_done', exists (
              select 1 from public.lesson_progress lp
              join public.lessons l on l.id = lp.lesson_id
              where lp.user_id = p.id and l.module_id = m.id
                and l.day_of_week = 'Fri' and lp.status = 'completed'
            ),
            'sat_writing_done', exists (
              select 1 from public.lesson_progress lp
              join public.lessons l on l.id = lp.lesson_id
              where lp.user_id = p.id and l.module_id = m.id
                and l.day_of_week = 'Sat' and lp.status = 'completed'
            )
          ) order by m.module_number)
          from public.modules m
        ), '[]'::jsonb),
        'checkpoints', coalesce((
          select jsonb_agg(jsonb_build_object(
            'attempt_id', ca.id,
            'code', cp.code,
            'title', cp.title,
            'timing', cp.timing_label,
            'status', ca.status,
            'scores', ca.scores,
            'result', ca.result,
            'teacher_status', ca.teacher_status,
            'teacher_notes', ca.teacher_notes,
            'teacher_readiness_decision', ca.teacher_readiness_decision,
            'completed_at', ca.completed_at
          ) order by cp.timing_label)
          from public.checkpoint_attempts ca
          join public.checkpoints cp on cp.id = ca.checkpoint_id
          where ca.user_id = p.id
        ), '[]'::jsonb),
        'top_errors', coalesce((
          select jsonb_agg(jsonb_build_object(
            'error_category', err.error_category,
            'occurrences', err.occurrences,
            'examples', err.examples
          ) order by err.occurrences desc)
          from (
            select erc.category::text as error_category,
                   sum(coalesce(erc.occurrence_count, 1))::int as occurrences,
                   jsonb_agg(jsonb_build_object(
                     'incorrect', erc.prompt_sentence,
                     'target', erc.corrected_sentence,
                     'explanation', erc.explanation
                   ) order by erc.created_at desc) as examples
            from public.error_review_cards erc
            where erc.user_id = p.id
            group by erc.category
            order by sum(coalesce(erc.occurrence_count, 1)) desc
            limit 5
          ) err
        ), '[]'::jsonb),
        'recent_speaking', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', sa.id,
            'task_title', st.title,
            'duration_seconds', sa.duration_seconds,
            'transcript', sa.transcript,
            'overall', sa.overall,
            'feedback', sa.feedback,
            'teacher_status', coalesce(sa.teacher_status, 'pending'),
            'teacher_notes', sa.teacher_notes,
            'teacher_pronunciation_note', sa.teacher_pronunciation_note,
            'created_at', sa.created_at
          ) order by sa.created_at desc)
          from (
            select * from public.speaking_attempts
            where user_id = p.id
            order by created_at desc
            limit 5
          ) sa
          left join public.speaking_tasks st on st.id = sa.task_id
        ), '[]'::jsonb),
        'recent_writing', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ws.id,
            'task_title', wt.title,
            'body', ws.body,
            'word_count', ws.word_count,
            'overall', ws.overall,
            'feedback', ws.feedback,
            'corrections', ws.corrections,
            'teacher_status', coalesce(ws.teacher_status, 'pending'),
            'teacher_notes', ws.teacher_notes,
            'created_at', ws.created_at
          ) order by ws.created_at desc)
          from (
            select * from public.writing_submissions
            where user_id = p.id
            order by created_at desc
            limit 5
          ) ws
          left join public.writing_tasks wt on wt.id = ws.task_id
        ), '[]'::jsonb)
      ) as learner_row
      from public.profiles p
      where p.role = 'learner'
    ) rows
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.teacher_get_roster() from public, anon;
grant execute on function public.teacher_get_roster() to authenticated;

create or replace function public.teacher_submit_review(
  p_target_type text,
  p_target_id uuid,
  p_teacher_status text,
  p_teacher_notes text default null,
  p_pronunciation_note text default null,
  p_readiness_decision text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_reviewer uuid := auth.uid();
begin
  if v_reviewer is null or not public.is_teacher() then
    raise exception 'Teacher access required' using errcode = '42501';
  end if;

  if p_teacher_status not in ('pending', 'confirmed', 'needs_work', 'overridden') then
    raise exception 'Invalid teacher_status' using errcode = '22023';
  end if;

  if p_target_type = 'speaking' then
    update public.speaking_attempts
       set teacher_status = p_teacher_status,
           teacher_notes = p_teacher_notes,
           teacher_pronunciation_note = p_pronunciation_note,
           teacher_reviewed_at = now(),
           teacher_reviewed_by = v_reviewer
     where id = p_target_id;
  elsif p_target_type = 'writing' then
    update public.writing_submissions
       set teacher_status = p_teacher_status,
           teacher_notes = p_teacher_notes,
           teacher_reviewed_at = now(),
           teacher_reviewed_by = v_reviewer
     where id = p_target_id;
  elsif p_target_type = 'checkpoint' then
    update public.checkpoint_attempts
       set teacher_status = p_teacher_status,
           teacher_notes = p_teacher_notes,
           teacher_readiness_decision = p_readiness_decision,
           teacher_reviewed_at = now(),
           teacher_reviewed_by = v_reviewer
     where id = p_target_id;
  else
    raise exception 'Invalid target_type' using errcode = '22023';
  end if;

  if not found then
    raise exception 'Target record not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'target_id', p_target_id, 'teacher_status', p_teacher_status);
end;
$$;

revoke all on function public.teacher_submit_review(text, uuid, text, text, text, text) from public, anon;
grant execute on function public.teacher_submit_review(text, uuid, text, text, text, text) to authenticated;
