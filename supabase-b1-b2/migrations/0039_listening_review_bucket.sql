-- ============================================================================
-- Migration 0039: private review bucket for the Weeks 1–4 listening tracks.
--
-- Until a track is approved, nobody outside the pipeline should be able to
-- fetch it. `course-audio` is a public bucket, so an unreleased file there is one
-- guessed URL away from a learner. Generated tracks now land here instead:
--
--   course-audio-review   private, no policies at all -> service role only
--
-- Workflow:
--   voice-check  one line per speaker, uploaded here, 1-hour signed links
--   generate     writes <prefix>/week-N-listening.mp3 + .vtt here, unreleased
--   review       prints 1-hour signed links (createSignedUrl works on a private
--                bucket because the pipeline holds the service-role key)
--   release      copies the two objects into the public `course-audio` bucket and
--                sets listening_audio_trials.audio_url
--   revoke       clears the public URLs and removes the public copy; the review
--                copy stays so the track can be re-approved
--   delete       removes the review copy as well as the public one
--
-- No storage.objects policies are added on purpose: the bucket is reachable by
-- the service role only. Signed URLs are minted by the service role, and they
-- expire after one hour.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-audio-review',
  'course-audio-review',
  false,
  26214400,
  array['audio/mp3', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'text/plain', 'text/vtt']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Belt and braces: creation alone does not clear a bucket that already existed
-- as public, and a leftover RLS policy on storage.objects would expose it again.
update storage.buckets set public = false where id = 'course-audio-review';
drop policy if exists "public read course audio review" on storage.objects;

-- The schema guard enumerates every bucket, so extend the expected inventory.
-- The rest of the function is migration 0026 verbatim: only the bucket list
-- changed, so a future edit cannot quietly weaken the column/function/policy/
-- trigger checks.
create or replace function public.verify_app_schema()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with expected_tables(name) as (
    select unnest(string_to_array('ai_evaluation_cache,ai_request_logs,ai_usage_events,badges,checkpoint_attempts,checkpoints,content_inputs,courses,curriculum_preferences,daily_sessions,enrollments,error_review_cards,learner_errors,lesson_blocks,lesson_progress,lesson_vocab,lessons,listening_audio_trials,mediation_attempts,modules,placement_questions,practice_attempts,practice_items,profiles,skill_levels,speaking_attempts,speaking_tasks,stripe_events,subscriptions,syllabus_assessments,syllabus_checkpoint_items,syllabus_checkpoints,syllabus_course,syllabus_grammar_items,syllabus_input_items,syllabus_skill_ladders,syllabus_stages,syllabus_vocab_items,syllabus_week_details,syllabus_weekly_tasks,syllabus_weeks,user_badges,vocab_cards,vocab_decks,vocab_items,vocab_reviews,weekly_reports,writing_submissions,writing_tasks,xp_events', ','))
  ), column_groups(value) as (
    select unnest(string_to_array('ai_evaluation_cache=cache_key,created_at,endpoint,hit_count,last_hit_at,model,response;ai_request_logs=audio_seconds,cache_hit,completion_tokens,created_at,endpoint,error_message,estimated_cost_usd,id,input_chars,latency_ms,model,prompt_tokens,status_code,user_id;ai_usage_events=endpoint,id,occurred_at,units,user_id;badges=code,created_at,criteria,description,icon,id,title,xp_reward;checkpoint_attempts=checkpoint_id,completed_at,id,result,scores,speaking_attempt_id,started_at,status,teacher_status,user_id,writing_submission_id;checkpoints=code,course_id,created_at,description,duration_minutes,id,module_id,skills,tasks,timing_label,title;content_inputs=accent,audio_url,body,created_at,duration_seconds,id,kind,lesson_id,module_id,questions,source_label,speaker_accents,title,word_count;courses=created_at,daily_flow,daily_minutes_max,daily_minutes_min,description,duration_weeks,id,level_from,level_to,min_hours,published,skill_balance,slug,subtitle,title,total_hours,updated_at,weekly_hours;curriculum_preferences=target_hours_per_week,updated_at,user_id;daily_sessions=completed_blocks,created_at,id,lesson_id,plan,session_date,total_minutes,user_id;enrollments=completed_at,course_id,current_lesson_number,id,started_at,target_completion_date,user_id;error_review_cards=card_format,category,context_sentence,corrected_sentence,created_at,difficulty,due_at,ease,explanation,fsrs_state,hint_revealed_at,id,interval_days,lapses,last_attempt_text,last_review_at,learner_error_id,learning_steps,mastered,mastered_at,normalized_key,occurrence_count,prompt_sentence,reps,stability,suspended,updated_at,user_id;learner_errors=category,corrected,created_at,explanation,id,lesson_id,original,other_label,severity,source_id,source_type,source_word_count,user_id;lesson_blocks=block_kind,content,created_at,id,lesson_id,minutes,sort_order,title;lesson_progress=blocks_completed,completed_at,id,last_viewed_at,lesson_id,output_submitted,practice_correct,practice_total,started_at,status,user_id;lesson_vocab=lesson_id,sort_order,vocab_item_id;lessons=can_do,course_id,created_at,day_of_week,duration_minutes,explanation,grammar_point,grammar_point_key,id,lesson_number,module_id,module_lesson_number,objective,primary_skill,title,updated_at,xp_reward;listening_audio_trials=audio_url,caption_cues,captions_url,duration_seconds,generated_at,model,released,released_at,source,updated_at,voices,week;mediation_attempts=created_at,disputed,feedback,id,needs_review,response_text,review_reason,task_key,transcript,user_id,week;modules=course_id,created_at,grammar_focus,hours,id,lesson_end,lesson_start,module_number,skill_mix,summary,title,updated_at,vocab_pack,vocabulary_topic,week_number;placement_questions=active,answer_index,area,created_at,id,options,question,sort_order;practice_attempts=attempted_at,id,is_correct,item_id,lesson_id,response,user_id;practice_items=accepted_answers,answer,created_at,difficulty,explanation,grammar_point,id,kind,lesson_id,options,prompt,sort_order;profiles=avatar_url,created_at,daily_word_goal,email,full_name,id,last_active_on,learner_band,longest_streak,onboarding_completed,placement_result,role,streak_days,stripe_customer_id,target_band,timezone,updated_at,xp_total;skill_levels=lessons_completed,score,skill,updated_at,user_id,xp;speaking_attempts=ai_model,audio_path,coherence,created_at,duration_seconds,evaluated_at,feedback,fluency,grammar_accuracy,id,improvements,lesson_id,lexical_range,mime_type,overall,pronunciation,status,strengths,task_id,teacher_status,transcript,user_id,word_count;speaking_tasks=created_at,id,kind,lesson_id,model_answer,module_id,prompt,rubric,target_linkers,target_seconds,target_terms,title,useful_phrases,xp_reward;stripe_events=created_at,id,type;subscriptions=cancel_at_period_end,created_at,current_period_end,id,price_id,quantity,status,user_id;syllabus_assessments=code,payload,title;syllabus_checkpoint_items=id,key,options,prompt,reason,reserve,sort_order,target,week_number;syllabus_checkpoints=after_week,assessed,checkpoint_number,code,stage_number,title;syllabus_course=key,payload,source,version;syllabus_grammar_items=id,payload,sort_order,step,target,week_number;syllabus_input_items=id,mode,payload,sort_order,step,week_number;syllabus_skill_ladders=label,skill_key,sort_order,value,week_range;syllabus_stages=aim,checkpoint_weeks,extra_input,grammar_focus,hours,listening_reading,phases,slug,speaking,stage_number,starting_level,title,vocabulary_focus,week_end,week_start,weeks,writing;syllabus_vocab_items=card,cefr,example,group_kind,id,sort_order,target,use_role,week_number;syllabus_week_details=payload,week_number;syllabus_weekly_tasks=href,requirement_kind,requirement_label,sort_order,suggested_order,task_key,time_label,title;syllabus_weeks=cefr,checkpoint_number,main_grammar,phase,secondary_grammar,secondary_grammar_label,skills_focus,stage_number,theme,week_number;user_badges=badge_id,earned_at,user_id;vocab_cards=card_kind,created_at,due_at,ease,id,interval_days,ladder_step,lapses,reps,stability,suspended,updated_at,user_id,vocab_item_id;vocab_decks=course_id,created_at,daily_target,description,id,module_id,slug,title,topic;vocab_items=audio_url,band,collocations,created_at,deck_id,definition,example,id,ipa,part_of_speech,teaching_role,term,translation_es,usage_note,word_family;vocab_reviews=card_id,due_at,grade,id,interval_days,reviewed_at,user_id,vocab_item_id;weekly_reports=created_at,id,payload,recordings,study_minutes,user_id,weakest_skill,week_start,words_learned,writing_tasks;writing_submissions=ai_model,body,corrections,created_at,evaluated_at,feedback,grammar_accuracy,id,lesson_id,lexical_range,organisation,overall,revised_from,status,style,task_id,task_response,teacher_status,user_id,word_count;writing_tasks=created_at,format,id,lesson_id,module_id,outline,prompt,title,word_max,word_min,xp_reward;xp_events=created_at,id,note,points,ref_id,ref_type,source,user_id', ';'))
  ), expected_columns(value) as (
    select split_part(cg.value, '=', 1) || '|' || col
    from column_groups cg,
      unnest(string_to_array(split_part(cg.value, '=', 2), ',')) as col
  ), expected_functions(value) as (
    select unnest(string_to_array('apply_fsrs_review|11,award_xp|6,build_weekly_report|1,cleanup_expired_retention_data|0,consume_ai_usage|2,delete_my_learning_data|0,enforce_output_before_progress|0,ensure_vocab_cards|1,evaluate_badges|0,get_ai_eval_cache|1,get_ai_observability_summary|1,get_curriculum_outline|0,get_due_cards|1,get_learner_dashboard|0,get_lesson|1,handle_new_user|0,import_assessments|1,import_course|1,import_curriculum_preference|0,import_modules|1,is_staff|0,is_teacher|0,level_for_xp|1,log_ai_request|11,mark_error_card_mastered|2,record_activity|2,reveal_error_card_hint|1,review_vocab_card|2,reward_checkpoint|0,reward_lesson_completion|0,reward_speaking_attempt|0,reward_writing_submission|0,set_ai_eval_cache|4,strip_answer_fields|1,teacher_get_roster|0,teacher_submit_review|6,touch_skill|4,touch_updated_at|0,verify_app_schema|0,verify_delete_my_learning_data_coverage|0', ','))
  ), expected_policies(value) as (
    select unnest(string_to_array('public|ai_request_logs|own ai logs select,public|badges|public can read badges,public|checkpoint_attempts|own rows delete,public|checkpoint_attempts|own rows insert,public|checkpoint_attempts|own rows select,public|checkpoint_attempts|own rows update,public|checkpoints|signed-in can read checkpoints,public|content_inputs|public preview content_inputs,public|content_inputs|signed-in can read content_inputs,public|courses|public can read courses,public|curriculum_preferences|own prefs insert,public|curriculum_preferences|own prefs select,public|curriculum_preferences|own prefs update,public|daily_sessions|own rows delete,public|daily_sessions|own rows insert,public|daily_sessions|own rows select,public|daily_sessions|own rows update,public|enrollments|own rows delete,public|enrollments|own rows insert,public|enrollments|own rows select,public|enrollments|own rows update,public|error_review_cards|own error cards delete,public|error_review_cards|own error cards insert,public|error_review_cards|own error cards select,public|error_review_cards|own error cards update,public|learner_errors|own errors delete,public|learner_errors|own errors insert,public|learner_errors|own errors select,public|learner_errors|own errors update,public|lesson_blocks|public preview lesson_blocks,public|lesson_blocks|signed-in can read lesson_blocks,public|lesson_progress|own rows delete,public|lesson_progress|own rows insert,public|lesson_progress|own rows select,public|lesson_progress|own rows update,public|lesson_vocab|signed-in can read lesson_vocab,public|lessons|public preview lessons,public|lessons|signed-in can read lessons,public|listening_audio_trials|public can read listening audio trials,public|mediation_attempts|own mediation attempts insert,public|mediation_attempts|own mediation attempts select,public|mediation_attempts|own mediation attempts update,public|modules|public can read modules,public|placement_questions|placement_questions_staff_read,public|placement_questions|public read placement questions,public|practice_attempts|own rows delete,public|practice_attempts|own rows insert,public|practice_attempts|own rows select,public|practice_attempts|own rows update,public|practice_items|signed-in can read practice_items,public|profiles|own profile insert,public|profiles|own profile select,public|profiles|own profile update,public|skill_levels|own skill meters select,public|speaking_attempts|own rows delete,public|speaking_attempts|own rows insert,public|speaking_attempts|own rows select,public|speaking_attempts|own rows update,public|speaking_tasks|public preview speaking_tasks,public|speaking_tasks|signed-in can read speaking_tasks,public|subscriptions|own subscriptions select,public|syllabus_assessments|syllabus_assessments_staff_read,public|syllabus_checkpoint_items|syllabus_checkpoint_items_staff_read,public|syllabus_checkpoints|syllabus_checkpoints_public_read,public|syllabus_course|syllabus_course_public_read,public|syllabus_grammar_items|syllabus_grammar_items_staff_read,public|syllabus_input_items|syllabus_input_items_staff_read,public|syllabus_skill_ladders|syllabus_skill_ladders_public_read,public|syllabus_stages|syllabus_stages_public_read,public|syllabus_vocab_items|syllabus_vocab_items_public_read,public|syllabus_week_details|syllabus_week_details_staff_read,public|syllabus_weekly_tasks|syllabus_weekly_tasks_public_read,public|syllabus_weeks|syllabus_weeks_public_read,public|user_badges|own badges select,public|vocab_cards|own rows delete,public|vocab_cards|own rows insert,public|vocab_cards|own rows select,public|vocab_cards|own rows update,public|vocab_decks|public preview vocab_decks,public|vocab_decks|signed-in can read vocab_decks,public|vocab_items|public preview vocab_items,public|vocab_items|signed-in can read vocab_items,public|vocab_reviews|own rows delete,public|vocab_reviews|own rows insert,public|vocab_reviews|own rows select,public|vocab_reviews|own rows update,public|weekly_reports|own rows delete,public|weekly_reports|own rows insert,public|weekly_reports|own rows select,public|weekly_reports|own rows update,public|writing_submissions|own rows delete,public|writing_submissions|own rows insert,public|writing_submissions|own rows select,public|writing_submissions|own rows update,public|writing_tasks|public preview writing_tasks,public|writing_tasks|signed-in can read writing_tasks,public|xp_events|own rows delete,public|xp_events|own rows insert,public|xp_events|own rows select,public|xp_events|own rows update,storage|objects|public read course audio,storage|objects|recordings own delete,storage|objects|recordings own read,storage|objects|recordings own update,storage|objects|recordings own write', ','))
  ), expected_triggers(value) as (
    select unnest(string_to_array('auth|users|on_auth_user_created,public|checkpoint_attempts|checkpoint_reward,public|courses|courses_touch,public|error_review_cards|error_review_cards_touch,public|lesson_progress|lesson_progress_output_gate,public|lesson_progress|lesson_progress_reward,public|lessons|lessons_touch,public|listening_audio_trials|listening_audio_trials_touch,public|modules|modules_touch,public|profiles|profiles_default_prefs,public|profiles|profiles_touch,public|speaking_attempts|speaking_attempt_reward,public|vocab_cards|vocab_cards_touch,public|writing_submissions|writing_submission_reward', ','))
  ), expected_buckets(name) as (
    select unnest(string_to_array('course-audio,course-audio-review,speaking-recordings', ','))
  ),
  missing_tables as (
    select name from expected_tables where to_regclass('public.' || name) is null
  ),
  missing_columns as (
    select e.value from expected_columns e
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = split_part(e.value, '|', 1)
        and c.column_name = split_part(e.value, '|', 2)
    )
  ),
  missing_functions as (
    select e.value from expected_functions e
    where not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = split_part(e.value, '|', 1)
        and coalesce(array_length(p.proargtypes, 1), 0) = split_part(e.value, '|', 2)::int
    )
  ),
  missing_policies as (
    select e.value from expected_policies e
    where not exists (
      select 1 from pg_policies pol
      where pol.schemaname = split_part(e.value, '|', 1)
        and pol.tablename = split_part(e.value, '|', 2)
        and pol.policyname = split_part(e.value, '|', 3)
    )
  ),
  missing_triggers as (
    select e.value from expected_triggers e
    where not exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal
        and n.nspname = split_part(e.value, '|', 1)
        and c.relname = split_part(e.value, '|', 2)
        and t.tgname = split_part(e.value, '|', 3)
    )
  ),
  missing_buckets as (
    select e.name from expected_buckets e
    where not exists (select 1 from storage.buckets b where b.id = e.name)
  )
  select jsonb_build_object(
    'covered', (
      (select count(*) from missing_tables) = 0
      and (select count(*) from missing_columns) = 0
      and (select count(*) from missing_functions) = 0
      and (select count(*) from missing_policies) = 0
      and (select count(*) from missing_triggers) = 0
      and (select count(*) from missing_buckets) = 0
    ),
    'missing_tables', (select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from missing_tables),
    'missing_columns', (select coalesce(jsonb_agg(value order by value), '[]'::jsonb) from missing_columns),
    'missing_functions', (select coalesce(jsonb_agg(value order by value), '[]'::jsonb) from missing_functions),
    'missing_policies', (select coalesce(jsonb_agg(value order by value), '[]'::jsonb) from missing_policies),
    'missing_triggers', (select coalesce(jsonb_agg(value order by value), '[]'::jsonb) from missing_triggers),
    'missing_buckets', (select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from missing_buckets),
    'checked', jsonb_build_object(
      'tables', (select count(*) from expected_tables),
      'columns', (select count(*) from expected_columns),
      'functions', (select count(*) from expected_functions),
      'policies', (select count(*) from expected_policies),
      'triggers', (select count(*) from expected_triggers),
      'buckets', (select count(*) from expected_buckets)
    )
  );
$$;

notify pgrst, 'reload schema';
