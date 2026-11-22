\set ON_ERROR_STOP on
begin;
do $$
declare
  u uuid := gen_random_uuid(); c uuid; m uuid; l uuid; p uuid; sp uuid; wr uuid;
  d uuid; v uuid; vc uuid; cp uuid; b uuid; n bigint; t record; result jsonb;
begin
  insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
    values (u, 'deletion-isolated@example.test', '{}', '{}', 'authenticated', 'authenticated');
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
  insert into public.issue_reports(user_id,type,message,page_url) values(u,'feedback','test','/week/1');
  insert into public.issue_report_attempts(user_id) values(u);
  if to_regclass('public.week_vocabulary_attempts') is not null then
    execute 'insert into public.week_vocabulary_attempts(user_id,week_number,item_id,answer,correct) values ($1,1,''V1-R1'',''test'',false)' using u;
  end if;
  -- Fail if schema gains a learner-owned table for which this test has no fixture.
  for t in select c.table_name from information_schema.columns c join information_schema.tables tb using (table_schema,table_name)
    where c.table_schema='public' and c.column_name='user_id' and tb.table_type='BASE TABLE' loop
    execute format('select count(*) from public.%I where user_id=$1',t.table_name) into n using u;
    if n < 1 then raise exception 'Missing test fixture for %',t.table_name; end if;
  end loop;
  perform set_config('request.jwt.claim.sub',u::text,true);
  result := public.delete_my_learning_data();
  if result->>'deleted' <> 'true' or not (result->'audio_paths' ? (u::text||'/recording.wav')) then raise exception 'Unexpected deletion result %',result; end if;
  for t in select c.table_name from information_schema.columns c join information_schema.tables tb using (table_schema,table_name)
    where c.table_schema='public' and c.column_name='user_id' and tb.table_type='BASE TABLE' loop
    execute format('select count(*) from public.%I where user_id=$1',t.table_name) into n using u;
    if t.table_name in ('subscriptions','pilot_learners') then
      if n <> 1 then raise exception 'Retained data missing for %',t.table_name; end if;
    elsif n <> 0 then raise exception 'Learner rows remain in %: %',t.table_name,n;
    end if;
  end loop;
  if not exists (select 1 from public.profiles where id=u and role='learner' and xp_total=0 and longest_streak=0 and placement_result is null and not onboarding_completed) then raise exception 'Profile not reset'; end if;
  if not (public.verify_delete_my_learning_data_coverage()->>'covered')::boolean then raise exception 'Coverage check failed: %',public.verify_delete_my_learning_data_coverage(); end if;
end $$;
rollback;
