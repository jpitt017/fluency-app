\set ON_ERROR_STOP on
begin;
do $$
declare
  u uuid := gen_random_uuid(); other_user uuid := gen_random_uuid(); c uuid; m uuid; l uuid; p uuid; sp uuid; wr uuid;
  d uuid; v uuid; vc uuid; cp uuid; b uuid; n bigint; t record; result jsonb;
  week_take uuid := gen_random_uuid(); week_check uuid := gen_random_uuid();
  deletion_lock uuid := gen_random_uuid(); week_path text;
begin
  insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
    values (u, 'deletion-isolated@example.test', '{}', '{}', 'authenticated', 'authenticated'),
           (other_user, 'deletion-other@example.test', '{}', '{}', 'authenticated', 'authenticated');
  insert into public.courses(slug,title,description,total_hours) values ('delete-test','test','test',1) returning id into c;
  insert into public.modules(course_id,module_number,title,summary,lesson_start,lesson_end,vocabulary_topic) values (c,999,'test','test',1,1,'test') returning id into m;
  insert into public.lessons(course_id,module_id,lesson_number,module_lesson_number,title,objective,can_do) values (c,m,999,1,'test','test','test') returning id into l;
  insert into public.practice_items(lesson_id,kind,prompt,answer) values (l,'multiple_choice','test','test') returning id into p;
  insert into public.speaking_tasks(module_id,title,prompt) values (m,'test','test') returning id into sp;
  insert into public.writing_tasks(module_id,title,prompt,format,word_min,word_max) values (m,'test','test','test',1,20) returning id into wr;
  insert into public.vocab_decks(course_id,slug,title,topic) values (c,'delete-test','test','test') returning id into d;
  insert into public.vocab_items(deck_id,term,definition,example) values (d,'test','test','test') returning id into v;
  insert into public.checkpoints(course_id,code,title,timing_label,description) values (c,'delete-test','test','test','test') returning id into cp;
  insert into public.badges(code,title,description) values ('delete-test','test','test') returning id into b;
  update public.profiles set role='learner', xp_total=42, longest_streak=10, placement_result='{}', onboarding_completed=true where id=u;
  insert into public.pilot_learners(user_id) values(u);
  insert into public.subscriptions(id,user_id,status,price_id,current_period_end) values ('delete-test',u,'active','test',now());
  insert into public.enrollments(user_id,course_id) values(u,c);
  insert into public.lesson_progress(user_id,lesson_id) values(u,l);
  insert into public.practice_attempts(user_id,item_id,lesson_id,is_correct) values(u,p,l,false);
  insert into public.vocab_cards(user_id,vocab_item_id) values(u,v) returning id into vc;
  insert into public.vocab_reviews(user_id,card_id,vocab_item_id,grade,interval_days,due_at) values(u,vc,v,'good',1,now());
  insert into public.speaking_attempts(user_id,task_id,audio_path,transcript) values(u,sp,u::text||'/recording.wav','test');
  insert into public.writing_submissions(user_id,task_id,body) values(u,wr,'test');
  insert into public.checkpoint_attempts(user_id,checkpoint_id) values(u,cp);
  insert into public.xp_events(user_id,source,points) values(u,'lesson',1);
  insert into public.skill_levels(user_id,skill) values(u,'grammar') on conflict (user_id,skill) do update set score=1;
  insert into public.user_badges(user_id,badge_id) values(u,b);
  insert into public.weekly_reports(user_id,week_start) values(u,current_date);
  insert into public.daily_sessions(user_id) values(u);
  insert into public.curriculum_preferences(user_id) values(u) on conflict (user_id) do update set target_hours_per_week=5;
  insert into public.learner_errors(user_id,source_type,category,original,corrected,explanation) values(u,'writing','tense','test','test','test');
  insert into public.error_review_cards(user_id,category,prompt_sentence,corrected_sentence,explanation) values(u,'tense','test','test','test');
  insert into public.mediation_attempts(user_id,week,task_key,response_text) values(u,1,'test','test');
  insert into public.ai_request_logs(user_id,endpoint,model,status_code,latency_ms) values(u,'test','test',200,1);
  insert into public.ai_usage_events(user_id,endpoint,units) values(u,'test',1);
  insert into public.ai_usage_resets(user_id) values(u);
  insert into public.week_input_submissions(user_id,week_number,skill) values(u,1,'reading');
  insert into public.week_output_submissions(user_id,week_number,skill) values(u,1,'writing');
  if to_regclass('public.week_speaking_attempts') is not null then
    execute 'insert into public.week_speaking_attempts(id,user_id,week_number,notes,first_recording_path,first_transcript,second_recording_path,second_transcript) values ($1,$2,1,''[]''::jsonb,$3,''first take'',$4,''second take'')'
      using gen_random_uuid(), u, u::text||'/week-speaking/1/first.wav', u::text||'/week-speaking/1/second.wav';
  end if;
  -- Every new owner table needs a real row before the generic coverage loop.
  -- This check failed after saving and is still part of the deletion ledger.
  if to_regclass('public.week_speaking_takes') is not null then
    week_path := public.reserve_week_speaking_take(u, 2::smallint, week_take, 'first', 'webm', '[]', '[]', null)->>'path';
    perform public.finish_week_speaking_upload(u, week_take, true);
    perform public.reserve_week_speaking_check(u, week_take, week_check);
    perform public.finish_week_speaking_check(u, week_check, 'failed', null, null);
    if not public.begin_week_speaking_deletion(u, deletion_lock) then raise exception 'Could not acquire deletion fixture lock'; end if;
  end if;
  insert into public.issue_reports(user_id,type,message,page_url) values(u,'feedback','test','/week/1');
  insert into public.issue_report_attempts(user_id) values(u);
  if to_regclass('public.week_grammar_attempts') is not null then
    execute 'insert into public.week_grammar_attempts(user_id,week_number,item_id,answer,correct) values ($1,1,''W1-M1'',to_jsonb(''test''::text),false)' using u;
  end if;
  if to_regclass('public.week_model_views') is not null then
    execute 'insert into public.week_model_views(user_id,week_number,skill,viewed_before_submission) values ($1,1,''writing'',true)' using u;
  end if;
  if to_regclass('public.week_vocabulary_attempts') is not null then
    execute 'insert into public.week_vocabulary_attempts(user_id,week_number,item_id,answer,correct) values ($1,1,''V1-R1'',''test'',false)' using u;
  end if;
  -- Both checked versions and an unfinished draft belong to the learner.
  insert into public.week_sentence_practice(user_id, week_number, item_id, kind,
    first_answer, first_feedback, first_on_target, second_answer, second_feedback, second_on_target, draft_answer)
    values
      (u, 1, 'W1-U1', 'grammar-use-it', 'first version', '{"corrected":"first correction"}', false,
       'second version', '{"corrected":"second correction"}', true, 'unfinished draft'),
      (u, 1, 'V1-S1', 'vocabulary-sentence', 'first sentence', '{"corrected":"first sentence"}', true,
       'second sentence', '{"corrected":"second sentence"}', true, null),
      (other_user, 1, 'W1-U1', 'grammar-use-it', 'other learner', '{"corrected":"other learner"}', true,
       null, null, null, null);
  if to_regclass('public.week_skill_completions') is not null then
    execute 'insert into public.week_skill_completions(user_id,week_number,skill,answered,correct,total,review_count) values ($1,1,''grammar'',22,18,22,4)' using u;
    execute 'insert into public.week_skill_completions(user_id,week_number,skill,answered,correct,total,review_count) values ($1,1,''vocabulary'',16,13,16,3)' using u;
  end if;
  if to_regclass('public.week_input_answers') is not null then
    execute 'insert into public.week_input_answers(user_id,week_number,skill,item_id,answer,correct) values ($1,1,''reading'',''R1-G1'',''test'',false)' using u;
    -- A gloss-check answer. It shares this table but has its own id shape
    -- ("gloss-1-1"), which is why 0046 widened the length check; deletion must
    -- cover it like any other row here.
    execute 'insert into public.week_input_answers(user_id,week_number,skill,item_id,answer,correct) values ($1,1,''listening'',''gloss-1-1'',''suddenly understood'',true)' using u;
  end if;
  -- Fail if schema gains a learner-owned table for which this test has no fixture.
  for t in select c.table_name from information_schema.columns c join information_schema.tables tb using (table_schema,table_name)
    where c.table_schema='public' and c.column_name='user_id' and tb.table_type='BASE TABLE' loop
    execute format('select count(*) from public.%I where user_id=$1',t.table_name) into n using u;
    if n < 1 then raise exception 'Missing test fixture for %',t.table_name; end if;
  end loop;
  perform set_config('request.jwt.claim.sub',u::text,true);
  if to_regclass('public.week_speaking_takes') is not null then
    result := public.finish_week_speaking_deletion(u, deletion_lock);
    if not (result->'audio_paths' ? week_path) then raise exception 'New weekly recording missing from deletion result %', result; end if;
  else
    result := public.delete_my_learning_data();
  end if;
  if result->>'deleted' <> 'true' or not (result->'audio_paths' ? (u::text||'/recording.wav')) then raise exception 'Unexpected deletion result %',result; end if;
  if to_regclass('public.week_speaking_attempts') is not null and (
    not (result->'audio_paths' ? (u::text||'/week-speaking/1/first.wav'))
    or not (result->'audio_paths' ? (u::text||'/week-speaking/1/second.wav'))
  ) then raise exception 'Week speaking recordings missing from deletion result %',result; end if;
  for t in select c.table_name from information_schema.columns c join information_schema.tables tb using (table_schema,table_name)
    where c.table_schema='public' and c.column_name='user_id' and tb.table_type='BASE TABLE' loop
    execute format('select count(*) from public.%I where user_id=$1',t.table_name) into n using u;
    -- Subscriptions are billing and survive; pilot membership follows the
    -- account (0035 deletes it) and must go. 0024 first reported this profile
    -- as the table's 'deleted' flag, then 0035 added the delete without
    -- revisiting the comment or the test: live deletes it, so the test does too.
    if t.table_name = 'subscriptions' then
      if n <> 1 then raise exception 'Retained data missing for %',t.table_name; end if;
    elsif n <> 0 then raise exception 'Learner rows remain in %: %',t.table_name,n;
    end if;
  end loop;
  if not exists (select 1 from public.week_sentence_practice where user_id=other_user and first_answer='other learner') then
    raise exception 'Deleting one learner removed another learner’s sentence';
  end if;
  if not exists (select 1 from public.profiles where id=u and role='learner' and xp_total=0 and longest_streak=0 and placement_result is null and not onboarding_completed) then raise exception 'Profile not reset'; end if;
  if not (public.verify_delete_my_learning_data_coverage()->>'covered')::boolean then raise exception 'Coverage check failed: %',public.verify_delete_my_learning_data_coverage(); end if;
end $$;
rollback;
