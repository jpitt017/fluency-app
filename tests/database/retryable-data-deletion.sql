-- Synthetic fixtures only, inside a disposable local replay transaction.
\set ON_ERROR_STOP on
begin;
do $$
declare
  u uuid := gen_random_uuid(); other_user uuid := gen_random_uuid(); legacy_user uuid := gen_random_uuid(); staff_user uuid := gen_random_uuid();
  job uuid := gen_random_uuid(); old_job uuid := gen_random_uuid();
  first_claim jsonb; retry_claim jsonb; result jsonb; page1 jsonb; page2 jsonb; page3 jsonb; denied boolean; alert_finished boolean;
  original_generation uuid; current_generation uuid; other_generation uuid; file_a text; file_b text; issue_file text;
  late_issue text; later_issue text; late_speaking text; new_issue text; new_orphan text; legacy_orphan text; take_path text; take_path2 text; other_take_path text;
  take_id uuid := gen_random_uuid(); take_id2 uuid := gen_random_uuid(); orphan_take_id uuid := gen_random_uuid(); other_take_id uuid := gen_random_uuid();
  alert_u uuid := gen_random_uuid(); alert_other uuid := gen_random_uuid(); alert_token uuid := gen_random_uuid();
  alert_hash text := repeat('a', 64);
  course_id uuid; module_id uuid; task_id uuid; expired_attempt uuid; retention_result jsonb;
  allocated_before uuid; allocated_rolled_back uuid; allocated_after uuid;
begin
  allocated_before := public.allocate_recording_key();
  begin
    allocated_rolled_back := public.allocate_recording_key();
    raise exception 'synthetic failed allocation transaction';
  exception when raise_exception then null; end;
  allocated_after := public.allocate_recording_key();
  if allocated_before = allocated_rolled_back or allocated_after in (allocated_before, allocated_rolled_back)
     or substring(allocated_before::text, 15, 1) <> '8' then
    raise exception 'recording allocator reused an ID or did not use its UUIDv8 namespace';
  end if;
  insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data, aud, role) values
    (u, 'retryable-deletion-owner@example.test', '{}', '{}', 'authenticated', 'authenticated'),
    (other_user, 'retryable-deletion-other@example.test', '{}', '{}', 'authenticated', 'authenticated'),
    (legacy_user, 'retryable-deletion-legacy@example.test', '{}', '{}', 'authenticated', 'authenticated'),
    (staff_user, 'retryable-deletion-staff@example.test', '{}', '{}', 'authenticated', 'authenticated');
  update public.profiles set role='teacher' where id=staff_user;
  file_a := u::text || '/orphan-recording.webm';
  file_b := u::text || '/nested/another.webm';
  issue_file := u::text || '/report.png';
  legacy_orphan := legacy_user::text || '/legacy-unreferenced.webm';
  select data_deletion_generation into original_generation from public.profiles where id=u;

  -- Old and new cache RPC signatures both store feedback per learner, even
  -- when two learners supply the same cache key. The old application has no
  -- schema change to make. A pre-migration setter reaching its INSERT late is
  -- likewise assigned an owner by the trigger.
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform public.set_owned_ai_eval_cache('same-key','writing','test','{"feedback":"owner"}'::jsonb);
  if public.get_ai_eval_cache('same-key')->>'feedback' <> 'owner' then raise exception 'owned cache read failed'; end if;
  perform set_config('request.jwt.claim.sub', other_user::text, true);
  if public.get_owned_ai_eval_cache('same-key') is not null then raise exception 'cache leaked across learners'; end if;
  perform public.set_ai_eval_cache('same-key','writing','test','{"feedback":"other"}'::jsonb);
  if public.get_owned_ai_eval_cache('same-key')->>'feedback' <> 'other' then raise exception 'legacy cache RPC failed'; end if;
  perform set_config('request.jwt.claim.sub', legacy_user::text, true);
  insert into public.ai_evaluation_cache(cache_key,endpoint,model,response)
    values ('pre-migration-in-flight','writing','test','{"feedback":"legacy"}'::jsonb);
  if not exists (select 1 from public.ai_evaluation_cache where cache_owner_id=legacy_user
      and cache_key=legacy_user::text||':pre-migration-in-flight') then
    raise exception 'old in-flight setter created ownerless cached feedback';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  insert into storage.objects(bucket_id, name) values
    ('speaking-recordings', file_a), ('speaking-recordings', file_b), ('issue-attachments', issue_file),
    ('speaking-recordings', legacy_orphan);
  insert into storage.objects(bucket_id, name)
    select 'speaking-recordings', u::text || '/paged/' || lpad(n::text, 4, '0') || '.webm'
    from generate_series(1, 205) n;
  insert into public.week_input_submissions(user_id, week_number, skill) values (u, 1, 'reading');

  -- Synthetic expired and current rows exercise the real retention RPC while
  -- a durable deletion is pending. None of these fixtures leave this transaction.
  insert into public.ai_evaluation_cache(cache_owner_id,cache_key,endpoint,model,response,last_hit_at)
    values (u,u::text||':expired','writing','test','{}',now()-interval '91 days');
  insert into public.ai_request_logs(user_id,endpoint,model,status_code,latency_ms,created_at) values
    (u,'expired','test',200,1,now()-interval '13 months'), (u,'current','test',200,1,now());
  insert into public.ai_usage_events(user_id,endpoint,units,occurred_at) values
    (u,'expired',1,now()-interval '13 months'), (u,'current',1,now());
  insert into public.courses(slug,title,description,total_hours) values ('retention-'||u::text,'test','test',1) returning id into course_id;
  insert into public.modules(course_id,module_number,title,summary,lesson_start,lesson_end,vocabulary_topic)
    values (course_id,1,'test','test',1,1,'test') returning id into module_id;
  insert into public.speaking_tasks(module_id,title,prompt) values (module_id,'test','test') returning id into task_id;
  insert into public.speaking_attempts(user_id,task_id,audio_path,transcript,created_at)
    values (u,task_id,u::text||'/expired.webm','retained until deletion',now()-interval '13 months') returning id into expired_attempt;

  -- An alert is grouped across two owners. Prepare the claims before one of
  -- those owners starts deletion; only alert bookkeeping may touch the pending
  -- owner's existing row, never its message or other learning data.
  insert into public.issue_reports(id,user_id,type,message,page_url) values
    (alert_u,u,'broken','pending owner','https://example.test/page'),
    (alert_other,other_user,'broken','other owner','https://example.test/page');
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.headers', jsonb_build_object('x-fluency-data-owner',other_user)::text, true);
  if public.claim_issue_alert(alert_other,alert_hash,alert_token) <> 'send'
     or public.claim_issue_alert(alert_u,alert_hash,gen_random_uuid()) <> 'pending' then
    raise exception 'could not prepare the grouped issue alert';
  end if;
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.headers', '{}', true);

  -- Hold one owner's durable barrier while a different learner's old-app
  -- deletion completes. An obsolete global cache-expiry clause would try to
  -- touch the first owner's expired cache and make this deletion fail.
  if not public.begin_week_speaking_deletion(u, job) then raise exception 'begin failed'; end if;
  if not public.promote_retryable_data_deletion(u, job) then raise exception 'promotion failed'; end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- The service client carries the reporting learner's actor header, even
  -- though finishing the page group updates reports for additional owners.
  perform set_config('request.headers', jsonb_build_object('x-fluency-data-owner',other_user)::text, true);
  alert_finished := public.finish_issue_alert(alert_other,alert_hash,alert_token,true);
  if not alert_finished
     or not exists (select 1 from public.issue_reports where id=alert_other and email_sent_at is not null and not email_grouped)
     or not exists (select 1 from public.issue_reports where id=alert_u and email_sent_at is not null and email_grouped) then
    raise exception 'pending deletion blocked another owner''s grouped alert';
  end if;
  denied := false;
  begin update public.issue_reports set message='must not be changed',email_grouped=false where id=alert_u;
  exception when raise_exception then denied := true; end;
  if not denied or not exists (select 1 from public.issue_reports where id=alert_u and message='pending owner') then
    raise exception 'service alert exemption allowed report contents to change';
  end if;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  denied := false;
  begin update public.issue_reports set email_grouped=false where id=alert_u;
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'non-service alert update bypassed a pending deletion'; end if;
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.headers', '{}', true);
  perform set_config('request.jwt.claim.sub', staff_user::text, true);
  if public.teacher_get_data_deletion_generations()->>u::text <> original_generation::text then
    raise exception 'staff could not pin the learner generation';
  end if;
  denied := false;
  begin perform public.teacher_set_pilot(u,true);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'teacher assigned pilot access during a pending deletion'; end if;
  perform set_config('request.jwt.claim.sub', u::text, true);
  denied := false;
  begin perform public.teacher_get_data_deletion_generations();
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'learner enumerated other users'' generation markers'; end if;
  perform set_config('request.jwt.claim.sub', '', true);

  -- Old application against the expanded schema: the original finite lock and
  -- original wrapper still work; a completion marker is written atomically.
  if not public.begin_week_speaking_deletion(legacy_user, old_job) then raise exception 'old app could not begin'; end if;
  insert into public.week_input_submissions(user_id, week_number, skill) values (legacy_user, 1, 'reading');
  result := public.finish_week_speaking_deletion(legacy_user, old_job);
  if result->>'deleted' <> 'true' or not exists (select 1 from public.profiles where id=legacy_user and data_deletion_completed_at is not null) then
    raise exception 'old app could not finish and record completion on expanded schema';
  end if;
  if exists (select 1 from public.ai_evaluation_cache where cache_owner_id=legacy_user) then
    raise exception 'old-app deletion left owned feedback in the cache';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  if not exists (select 1 from public.list_late_deletion_files('', '', 100, legacy_user) where object_name=legacy_orphan) then
    raise exception 'old-app unreferenced object was not discovered by safety net';
  end if;

  -- Stripe and the scheduled retention job are service-role background work,
  -- not learner requests. The exemption is deliberately restricted to billing
  -- fields, deletes in the three retention tables, and clearing an audio path.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.headers', '{}', true);
  update public.profiles set stripe_subscription_id='fixture-sub',subscription_status='active' where id=u;
  if not exists (select 1 from public.profiles where id=u and subscription_status='active') then
    raise exception 'pending deletion blocked a billing webhook';
  end if;
  retention_result := public.cleanup_expired_retention_data();
  if (retention_result->>'cache_deleted')::int <> 1 or (retention_result->>'logs_deleted')::int <> 1
     or (retention_result->>'usage_deleted')::int <> 1
     or not (retention_result->'expired_audio_paths' ? (u::text||'/expired.webm')) then
    raise exception 'retention did not remove the expired fixtures: %', retention_result;
  end if;
  if not exists (select 1 from public.speaking_attempts where id=expired_attempt and audio_path is null
        and transcript='retained until deletion')
     or not exists (select 1 from public.ai_request_logs where user_id=u and endpoint='current')
     or not exists (select 1 from public.ai_usage_events where user_id=u and endpoint='current') then
    raise exception 'retention changed unexpired or non-audio data';
  end if;
  denied := false;
  begin update public.profiles set xp_total=99 where id=u;
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'background service changed learning profile fields during deletion'; end if;
  denied := false;
  begin update public.speaking_attempts set audio_path=null,transcript='new text' where id=expired_attempt;
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'background service changed learning text while clearing audio'; end if;
  denied := false;
  begin insert into public.week_input_submissions(user_id,week_number,skill) values(u,4,'reading');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'background service inserted learning data during deletion'; end if;
  perform set_config('request.headers', jsonb_build_object('x-fluency-data-owner',u)::text, true);
  denied := false;
  begin update public.profiles set subscription_status='past_due' where id=u;
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'learner-context request used the background billing exemption'; end if;
  perform set_config('request.headers', '{}', true);
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '{}', true);

  -- The job UUID appears in the browser receipt; it must not be a bypass secret.
  perform set_config('fluency.data_deletion_token', job::text, true);
  denied := false;
  begin insert into public.week_input_submissions(user_id, week_number, skill) values (u, 2, 'reading');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'pending job did not prevent new learning data'; end if;
  denied := false;
  begin update public.profiles set xp_total=99 where id=u;
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'pending job did not protect profile'; end if;
  perform set_config('request.jwt.claim.sub', u::text, true);
  denied := false;
  begin perform public.set_owned_ai_eval_cache('late-cache','writing','test','{"feedback":"late"}'::jsonb);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'pending job accepted cached learner feedback'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  denied := false;
  begin insert into storage.objects(bucket_id, name) values ('issue-attachments', u::text || '/late.png');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'pending job accepted a late upload'; end if;
  denied := false;
  begin perform public.finish_week_speaking_deletion(u, job);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'old wrapper bypassed durable worker fencing'; end if;
  -- Another learner is not locked by this user's job.
  insert into public.week_input_submissions(user_id, week_number, skill) values (other_user, 2, 'reading');
  insert into storage.objects(bucket_id, name) values ('issue-attachments', other_user::text || '/other.png');

  first_claim := public.claim_retryable_data_deletion(u, job);
  if first_claim is null then raise exception 'first worker not claimed'; end if;
  if public.claim_retryable_data_deletion(u, job) is not null then raise exception 'two workers claimed the same job'; end if;
  page1 := public.list_retryable_deletion_files(u,job,(first_claim->>'expiry')::timestamptz,(first_claim->>'token')::uuid);
  page2 := public.list_retryable_deletion_files(u,job,(first_claim->>'expiry')::timestamptz,(first_claim->>'token')::uuid,
    page1->99->>'bucket', page1->99->>'path');
  page3 := public.list_retryable_deletion_files(u,job,(first_claim->>'expiry')::timestamptz,(first_claim->>'token')::uuid,
    page2->99->>'bucket', page2->99->>'path');
  if jsonb_array_length(page1) <> 100 or jsonb_array_length(page2) <> 100 or jsonb_array_length(page3) <> 8
     or (select count(distinct entry->>'path') from jsonb_array_elements(page1 || page2 || page3) as entry) <> 208 then
    raise exception 'job did not page through every owned object exactly once';
  end if;
  denied := false;
  begin perform public.finish_retryable_data_deletion(u, job, (first_claim->>'expiry')::timestamptz, (first_claim->>'token')::uuid);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'rows removed while files remained'; end if;
  if not exists (select 1 from public.week_input_submissions where user_id=u) then raise exception 'failed finish removed learning rows'; end if;
  if not public.release_retryable_data_deletion(u, job, (first_claim->>'expiry')::timestamptz, (first_claim->>'token')::uuid) then raise exception 'release failed'; end if;
  if not exists (select 1 from public.week_speaking_deletion_locks where user_id=u and lock_id=job) then raise exception 'release removed pending job'; end if;

  -- Simulate a Storage batch that already deleted one file before failure.
  -- Only synthetic metadata is touched and the entire transaction rolls back.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id='speaking-recordings' and name=file_a;
  retry_claim := public.claim_retryable_data_deletion(u, job);
  if retry_claim is null or retry_claim->>'token' = first_claim->>'token' then raise exception 'retry did not acquire a fresh claim'; end if;
  -- Even an identical timestamp must not let the first worker release or
  -- finish the second worker's claim: the random token is the fence.
  update public.week_speaking_deletion_locks set expires_at=(first_claim->>'expiry')::timestamptz where user_id=u;
  retry_claim := jsonb_set(retry_claim, '{expiry}', to_jsonb(first_claim->>'expiry'));
  if public.release_retryable_data_deletion(u, job, (first_claim->>'expiry')::timestamptz, (first_claim->>'token')::uuid) then raise exception 'stale worker released new claim'; end if;
  denied := false;
  begin perform public.finish_retryable_data_deletion(u, job, (first_claim->>'expiry')::timestamptz, (first_claim->>'token')::uuid);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'stale worker finished deletion'; end if;
  delete from storage.objects where bucket_id='speaking-recordings' and (name=file_b or name like u::text || '/paged/%');
  delete from storage.objects where bucket_id='issue-attachments' and name=issue_file;
  result := public.finish_retryable_data_deletion(u, job, (retry_claim->>'expiry')::timestamptz, (retry_claim->>'token')::uuid);
  if result->>'deleted' <> 'true' then raise exception 'retry failed to finish'; end if;
  if exists (select 1 from public.week_input_submissions where user_id=u)
     or exists (select 1 from public.week_speaking_deletion_locks where user_id=u)
     or exists (select 1 from public.ai_evaluation_cache where cache_owner_id=u) then
    raise exception 'learner rows, cached feedback or pending job remain after completion';
  end if;
  if not exists (select 1 from public.ai_evaluation_cache where cache_owner_id=other_user and response->>'feedback'='other') then
    raise exception 'deletion removed another learner''s cache';
  end if;
  select data_deletion_generation into current_generation from public.profiles where id=u and data_deletion_completed_at is not null;
  if current_generation is null or current_generation=original_generation then raise exception 'completion did not rotate the upload generation'; end if;
  if public.allocate_recording_key() in (allocated_before, allocated_rolled_back, allocated_after) then
    raise exception 'recording allocator reused an ID after deletion';
  end if;
  if not exists (select 1 from public.week_input_submissions where user_id=other_user)
     or not exists (select 1 from storage.objects where bucket_id='issue-attachments' and name=other_user::text || '/other.png')
     or not exists (select 1 from public.issue_reports where id=alert_other and message='other owner' and email_sent_at is not null)
     or exists (select 1 from public.issue_reports where id=alert_u) then
    raise exception 'retry did not remove only the deleting learner''s data';
  end if;

  -- An upload that began in the new app before deletion is rejected even when
  -- its final Storage metadata and report arrive after successful completion.
  denied := false;
  begin insert into storage.objects(bucket_id,name) values
    ('issue-attachments',u::text||'/deletion-v1/'||original_generation::text||'/late.png');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'stale generation upload committed after deletion'; end if;
  denied := false;
  begin insert into public.issue_reports(user_id,type,message,page_url,data_deletion_generation)
    values(u,'feedback','old request','/week/1',original_generation);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'stale generation report committed after deletion'; end if;
  -- Current-generation metadata cannot turn an old snapshotted key into a
  -- new recording: a delayed removal of that old key might still be in flight.
  denied := false;
  begin insert into storage.objects(bucket_id,name,user_metadata) values
    ('speaking-recordings',file_a,jsonb_build_object('data_deletion_generation',current_generation));
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'current metadata reused a deleted recording key'; end if;

  -- Simulate two old-client uploads whose metadata finishes after deletion.
  -- The daily safety-net list catches each at any later run, but must preserve
  -- fresh generation-tagged files, a new weekly take and another user.
  late_issue := u::text || '/late-legacy-screenshot';
  later_issue := u::text || '/even-later-legacy-screenshot';
  late_speaking := u::text || '/late-legacy-audio.webm';
  new_issue := u::text || '/deletion-v1/' || current_generation::text || '/new-screenshot';
  insert into storage.objects(bucket_id,name) values
    ('issue-attachments',late_issue), ('speaking-recordings',late_speaking), ('issue-attachments',new_issue);
  denied := false;
  begin update storage.objects set user_metadata=jsonb_build_object('data_deletion_generation',current_generation)
    where bucket_id='speaking-recordings' and name=late_speaking;
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'current metadata converted a legacy key into new work'; end if;
  -- New recordings use a unique reservation before metadata is written. If
  -- that ledger subsequently disappears, the generation still protects the
  -- genuinely new, unreferenced file from the safety net.
  new_orphan := public.reserve_week_speaking_take(u,4::smallint,orphan_take_id,'first','webm','[]','[]',null)->>'path';
  insert into storage.objects(bucket_id,name,user_metadata) values
    ('speaking-recordings',new_orphan,jsonb_build_object('data_deletion_generation',current_generation));
  if not public.finish_week_speaking_upload(u,orphan_take_id,true) then raise exception 'new recording did not finish'; end if;
  delete from public.week_speaking_takes where id=orphan_take_id;
  insert into public.issue_reports(user_id,type,message,page_url,screenshot_path,data_deletion_generation)
    values(u,'feedback','new request','/week/1',new_issue,current_generation);
  take_path := public.reserve_week_speaking_take(u,1::smallint,take_id,'first','webm','[]','[]',null)->>'path';
  -- The fixture runs in one transaction: now() is the transaction start, so
  -- set a real post-deletion timestamp for this genuinely new reservation.
  update public.week_speaking_takes set created_at=clock_timestamp()+interval '1 second' where id=take_id;
  insert into storage.objects(bucket_id,name) values ('speaking-recordings',take_path);
  if not exists (select 1 from public.list_late_deletion_files('', '', 100, u) where object_name=late_issue)
     or not exists (select 1 from public.list_late_deletion_files('', '', 100, u) where object_name=late_speaking) then
    raise exception 'safety net missed a late upload';
  end if;
  if exists (select 1 from public.list_late_deletion_files('', '', 100, u) where object_name in (new_issue,take_path,new_orphan))
     or exists (select 1 from public.list_late_deletion_files('', '', 100, other_user)) then
    raise exception 'safety net targeted new work or an unrelated learner';
  end if;
  delete from storage.objects where name in (late_issue,late_speaking);
  insert into storage.objects(bucket_id,name) values ('issue-attachments',later_issue);
  if not exists (select 1 from public.list_late_deletion_files('', '', 100, u) where object_name=later_issue) then
    raise exception 'a later scheduled run missed a delayed upload';
  end if;
  delete from storage.objects where name=later_issue;

  -- In compatibility mode, an old teacher page can still assign pilot access
  -- without the new target header. Remove the fixture before testing the fence.
  perform set_config('request.jwt.claim.sub', staff_user::text, true);
  perform set_config('request.headers', '{}', true);
  perform public.teacher_set_pilot(u,true);
  if not exists (select 1 from public.pilot_learners where user_id=u) then
    raise exception 'legacy teacher could not assign pilot access during overlap';
  end if;
  perform public.teacher_set_pilot(u,false);

  -- This contract step is deliberately off in the migration. Once all old app
  -- instances have retired, a separately approved activation blocks legacy
  -- late uploads while permitting current-generation work.
  update public.data_deletion_safety_config set enforce_legacy_fence=true where singleton;
  -- Production RPCs use separate transactions; this whole fixture uses one.
  perform set_config('fluency.data_deletion_token', '', true);
  denied := false;
  begin perform public.teacher_set_pilot(u,true);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'fenced teacher request without target generation restored pilot data'; end if;
  perform set_config('request.headers', jsonb_build_object('x-fluency-target-generation',original_generation)::text, true);
  denied := false;
  begin perform public.teacher_set_pilot(u,true);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'stale teacher request restored pilot data'; end if;
  perform set_config('request.headers', jsonb_build_object('x-fluency-target-generation',current_generation)::text, true);
  perform public.teacher_set_pilot(u,true);
  if not exists (select 1 from public.pilot_learners where user_id=u) then
    raise exception 'fresh teacher request could not assign pilot access';
  end if;
  perform public.teacher_set_pilot(u,false);
  perform set_config('request.jwt.claim.sub', '', true);
  -- An ordinary learning/AI request may have begun before deletion but reach
  -- its database insert only afterwards. Its pinned epoch must be rejected,
  -- even when the service-role server makes the eventual insert.
  perform set_config('fluency.data_deletion_token', '', true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.headers', jsonb_build_object('x-fluency-data-generation', original_generation)::text, true);
  denied := false;
  begin insert into public.week_input_submissions(user_id,week_number,skill) values(u,3,'reading');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'stale authenticated learning request committed after deletion'; end if;
  denied := false;
  begin perform public.set_owned_ai_eval_cache('very-late','writing','test','{"feedback":"old response"}'::jsonb);
  exception when raise_exception then denied := true; end;
  if not denied or exists (select 1 from public.ai_evaluation_cache where cache_owner_id=u) then
    raise exception 'stale authenticated evaluation repopulated the cache after deletion';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.headers', jsonb_build_object('x-fluency-data-owner',u,'x-fluency-data-generation',original_generation)::text, true);
  denied := false;
  begin insert into public.week_input_submissions(user_id,week_number,skill) values(u,3,'reading');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'stale server learning request committed after deletion'; end if;
  perform set_config('request.headers', jsonb_build_object('x-fluency-data-owner','unverified','x-fluency-data-generation','missing')::text, true);
  denied := false;
  begin insert into public.week_input_submissions(user_id,week_number,skill) values(u,3,'reading');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'unverified server context was allowed'; end if;
  -- A fresh request with the rotated epoch is legitimate new work.
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.headers', jsonb_build_object('x-fluency-data-owner',u,'x-fluency-data-generation',current_generation)::text, true);
  insert into public.week_input_submissions(user_id,week_number,skill) values(u,3,'reading');
  perform public.set_owned_ai_eval_cache('fresh','writing','test','{"feedback":"new work"}'::jsonb);
  if public.get_owned_ai_eval_cache('fresh')->>'feedback' <> 'new work' then
    raise exception 'fresh learner cache write was rejected after deletion';
  end if;
  -- Storage's caller-policy probe uses the requester JWT; actual new-app
  -- uploads use service_role. Test both a completed deletion and an account
  -- with no deletion marker, including an old server's active reservation.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.method', 'POST', true);
  perform set_config('request.path', '/object/issue-attachments/synthetic', true);
  select data_deletion_generation into other_generation from public.profiles
    where id=other_user and data_deletion_completed_at is null;
  if other_generation is null then raise exception 'other account unexpectedly has a deletion marker'; end if;
  denied := false;
  begin insert into storage.objects(bucket_id,name) values ('issue-attachments',u::text||'/very-late.png');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted a legacy issue upload after deletion'; end if;
  denied := false;
  begin insert into storage.objects(bucket_id,name) values ('issue-attachments',other_user::text||'/other-after-fence.png');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted a legacy issue upload without a deletion'; end if;
  perform set_config('request.path', '/object/speaking-recordings/synthetic', true);
  denied := false;
  begin insert into storage.objects(bucket_id,name) values ('speaking-recordings',other_user::text||'/legacy.webm');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted an arbitrary legacy recording without a deletion'; end if;
  perform set_config('request.path', '/object/issue-attachments/synthetic', true);
  denied := false;
  begin insert into storage.objects(bucket_id,name) values ('issue-attachments','missing-owner/legacy.png');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted an invalid owner prefix'; end if;
  denied := false;
  begin insert into public.issue_reports(user_id,type,message,page_url) values(u,'feedback','legacy request','/week/1');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted a legacy issue report after deletion'; end if;
  denied := false;
  begin insert into public.issue_reports(user_id,type,message,page_url) values(other_user,'feedback','legacy request','/week/1');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted a legacy issue report without a deletion'; end if;
  -- Existing reports without a marker remain maintainable by staff.
  update public.issue_reports set status='Investigating' where id=alert_other;
  if not exists (select 1 from public.issue_reports where id=alert_other and status='Investigating') then
    raise exception 'activated fence blocked maintenance of an existing legacy report';
  end if;

  take_path2 := public.reserve_week_speaking_take(u,2::smallint,take_id2,'first','webm','[]','[]',null)->>'path';
  other_take_path := public.reserve_week_speaking_take(other_user,1::smallint,other_take_id,'first','webm','[]','[]',null)->>'path';
  perform set_config('request.path', '/object/speaking-recordings/synthetic', true);
  denied := false;
  begin insert into storage.objects(bucket_id,name) values ('speaking-recordings',take_path2);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted old weekly upload after deletion'; end if;
  denied := false;
  begin insert into storage.objects(bucket_id,name) values ('speaking-recordings',other_take_path);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted old weekly upload without a deletion'; end if;
  -- A direct browser cannot forge the current generation even with a live
  -- reservation; only the server may write these buckets after cutover.
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  denied := false;
  begin insert into storage.objects(bucket_id,name,user_metadata) values
    ('speaking-recordings',other_take_path,jsonb_build_object('data_deletion_generation',other_generation,'data_deletion_client','v1'));
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted a direct generation-tagged recording'; end if;
  perform set_config('request.path', '/object/issue-attachments/synthetic', true);
  denied := false;
  begin insert into storage.objects(bucket_id,name,user_metadata) values
    ('issue-attachments',other_user::text||'/deletion-v1/'||other_generation::text||'/direct.png',jsonb_build_object('data_deletion_client','v1'));
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted a direct generation-tagged issue attachment'; end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- A pre-signed URL may run as service_role, so valid metadata alone must not
  -- let it bypass the cutover. Also fail closed if provider context is absent.
  perform set_config('request.method', 'PUT', true);
  perform set_config('request.path', '/object/upload/sign/speaking-recordings/synthetic', true);
  denied := false;
  begin insert into storage.objects(bucket_id,name,user_metadata) values
    ('speaking-recordings',other_take_path,jsonb_build_object('data_deletion_generation',other_generation,'data_deletion_client','v1'));
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted a signed recording upload'; end if;
  perform set_config('request.method', '', true);
  perform set_config('request.path', '', true);
  denied := false;
  begin insert into storage.objects(bucket_id,name) values
    ('issue-attachments',other_user::text||'/deletion-v1/'||other_generation::text||'/no-context.png');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted missing Storage request context'; end if;
  perform set_config('request.method', 'POST', true);
  perform set_config('request.path', '/object/issue-attachments/synthetic', true);
  denied := false;
  begin insert into storage.objects(bucket_id,name,user_metadata) values
    ('issue-attachments',other_user::text||'/deletion-v1/'||other_generation::text||'/in-flight.png',jsonb_build_object('data_deletion_client','legacy'));
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted an in-flight old browser attachment'; end if;
  insert into storage.objects(bucket_id,name,user_metadata) values
    ('issue-attachments',u::text||'/deletion-v1/'||current_generation::text||'/new-audio',jsonb_build_object('data_deletion_client','v1')),
    ('issue-attachments',other_user::text||'/deletion-v1/'||other_generation::text||'/new-audio',jsonb_build_object('data_deletion_client','v1'));
  perform set_config('request.path', '/object/speaking-recordings/synthetic', true);
  denied := false;
  begin insert into storage.objects(bucket_id,name,user_metadata) values
    ('speaking-recordings',other_take_path,jsonb_build_object('data_deletion_generation',other_generation,'data_deletion_client','legacy'));
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence accepted an in-flight old browser recording'; end if;
  insert into storage.objects(bucket_id,name,user_metadata) values
    ('speaking-recordings',take_path2,jsonb_build_object('data_deletion_generation',current_generation,'data_deletion_client','v1')),
    ('speaking-recordings',other_take_path,jsonb_build_object('data_deletion_generation',other_generation,'data_deletion_client','v1'));
  denied := false;
  begin update storage.objects set name='missing-owner/moved.png'
    where bucket_id='issue-attachments' and name=other_user::text||'/deletion-v1/'||other_generation::text||'/new-audio';
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence let a protected object move outside its owner'; end if;
  denied := false;
  begin update storage.objects set bucket_id='course-audio'
    where bucket_id='issue-attachments' and name=other_user::text||'/deletion-v1/'||other_generation::text||'/new-audio';
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'activated fence let a protected object move outside its bucket'; end if;

  if has_function_privilege('authenticated','public.promote_retryable_data_deletion(uuid,uuid)','execute')
     or has_function_privilege('authenticated','public.finish_retryable_data_deletion(uuid,uuid,timestamptz,uuid)','execute')
     or has_function_privilege('authenticated','public.list_late_deletion_files(text,text,integer,uuid)','execute')
     or has_function_privilege('authenticated','public.allocate_recording_key()','execute')
     or not has_function_privilege('service_role','public.allocate_recording_key()','execute')
     or has_sequence_privilege('service_role','public.recording_key_sequence','usage')
     or has_column_privilege('service_role','public.data_deletion_safety_config','recording_key_namespace','update')
     or has_table_privilege('authenticated','public.data_deletion_safety_config','select')
     or has_column_privilege('authenticated','public.profiles','data_deletion_generation','update') then
    raise exception 'learner can bypass the server or alter security markers';
  end if;
  if not (public.verify_delete_my_learning_data_coverage()->>'covered')::boolean then
    raise exception 'deletion table coverage failed';
  end if;
end $$;
rollback;
