-- Synthetic-only fresh-replay coverage; rolled back on the isolated database.
\set ON_ERROR_STOP on
begin;
do $$
declare
  u uuid := gen_random_uuid(); other_user uuid := gen_random_uuid();
  first1 uuid := gen_random_uuid(); first2 uuid := gen_random_uuid(); first3 uuid := gen_random_uuid();
  practice uuid := gen_random_uuid(); retry1 uuid := gen_random_uuid(); retry2 uuid := gen_random_uuid(); retry3 uuid := gen_random_uuid();
  week2_first uuid := gen_random_uuid(); week2_retry1 uuid := gen_random_uuid(); week2_retry2 uuid := gen_random_uuid();
  failed_upload uuid := gen_random_uuid(); stale_check uuid;
  check_id uuid; lock_id uuid := gen_random_uuid(); other_take uuid := gen_random_uuid();
  item jsonb; result jsonb; paths text[] := '{}'; v_path text; f public.week_speaking_flows%rowtype;
  failed boolean;
begin
  insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data, aud, role) values
    (u, 'speaking-flow-owner@example.test', '{}', '{}', 'authenticated', 'authenticated'),
    (other_user, 'speaking-flow-other@example.test', '{}', '{}', 'authenticated', 'authenticated');

  item := public.reserve_week_speaking_take(u, 1::smallint, first1, 'first', 'webm', '[]', '[]', null);
  paths := array_append(paths, item->>'path');
  if public.begin_week_speaking_deletion(u, lock_id) then raise exception 'Deletion must wait for an upload'; end if;
  failed := false;
  begin perform public.reserve_week_speaking_take(u, 1::smallint, gen_random_uuid(), 'first', 'webm', '[]', '[]', null);
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'A concurrent upload bypassed the reservation'; end if;
  if not public.finish_week_speaking_upload(u, first1, true) then raise exception 'First upload did not finish'; end if;
  item := public.reserve_week_speaking_take(u, 1::smallint, first2, 'first', 'webm', '[]', '[]', null);
  paths := array_append(paths, item->>'path');
  perform public.finish_week_speaking_upload(u, first2, true);
  item := public.reserve_week_speaking_take(u, 1::smallint, first3, 'first', 'm4a', '[]', '[]', null);
  paths := array_append(paths, item->>'path');
  perform public.finish_week_speaking_upload(u, first3, true);
  select * into f from public.week_speaking_flows where user_id = u and week_number = 1;
  if f.first_versions <> 3 or f.first_take_id <> first3 or f.checks_used <> 0 or f.model_unlocked then
    raise exception 'First versions must replace the kept pointer without using checks: %', row_to_json(f);
  end if;
  if exists (select 1 from public.week_output_submissions where user_id = u and skill = 'speaking') then raise exception 'An unmarked preview must not count'; end if;
  failed := false;
  begin perform public.reserve_week_speaking_take(u, 1::smallint, gen_random_uuid(), 'first', 'webm', '[]', '[]', null);
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'A fourth first version was accepted'; end if;
  failed := false;
  begin perform public.reserve_week_speaking_check(u, first1, gen_random_uuid());
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'A replaced first version was checked'; end if;

  -- A quota denial cancels the reservation. An actual provider failure does
  -- not refund the task check; retries re-use the same privately saved audio.
  check_id := gen_random_uuid(); perform public.reserve_week_speaking_check(u, first3, check_id);
  failed := false;
  begin perform public.reserve_week_speaking_check(u, first3, gen_random_uuid());
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'A concurrent check bypassed the reservation'; end if;
  perform public.finish_week_speaking_check(u, check_id, 'cancelled', null, null);
  if (select checks_used from public.week_speaking_flows where user_id = u and week_number = 1) <> 0 then raise exception 'Denied quota consumed a check'; end if;
  check_id := gen_random_uuid(); perform public.reserve_week_speaking_check(u, first3, check_id);
  perform public.finish_week_speaking_check(u, check_id, 'succeeded', 'I moved to a new city.', '{"structure":{"structure":"which"}}');
  if not exists (select 1 from public.week_output_submissions where user_id = u and week_number = 1 and skill = 'speaking') then raise exception 'Kept first must count'; end if;
  if not exists (select 1 from public.week_speaking_flows where user_id = u and model_unlocked and checks_used = 1) then raise exception 'First check must unlock model atomically'; end if;

  item := public.reserve_week_speaking_take(u, 1::smallint, practice, 'structure', 'webm', '[]', '[]', first3);
  paths := array_append(paths, item->>'path'); perform public.finish_week_speaking_upload(u, practice, true);
  check_id := gen_random_uuid(); perform public.reserve_week_speaking_check(u, practice, check_id);
  perform public.finish_week_speaking_check(u, check_id, 'succeeded', 'I moved, which was exciting.', '{"used":true}');
  failed := false;
  begin perform public.reserve_week_speaking_take(u, 1::smallint, gen_random_uuid(), 'structure', 'webm', '[]', '[]', first3);
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'A second say-it-again recording for the same attempt was accepted'; end if;

  foreach other_take in array array[retry1, retry2, retry3] loop
    item := public.reserve_week_speaking_take(u, 1::smallint, other_take, 'retry', 'ogg', '[]', '["phrase"]', null);
    paths := array_append(paths, item->>'path'); perform public.finish_week_speaking_upload(u, other_take, true);
    check_id := gen_random_uuid(); perform public.reserve_week_speaking_check(u, other_take, check_id);
    perform public.finish_week_speaking_check(u, check_id, 'succeeded', 'A later try.', '{"cuePoints":[]}');
  end loop;
  select * into f from public.week_speaking_flows where user_id = u and week_number = 1;
  if f.retry_count <> 3 or f.checks_used <> 5 then raise exception 'Three retries and the five-check cap were not enforced: %', row_to_json(f); end if;
  failed := false;
  begin perform public.reserve_week_speaking_take(u, 1::smallint, gen_random_uuid(), 'retry', 'webm', '[]', '[]', null);
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'An extra try exceeded the cap'; end if;
  failed := false;
  begin perform public.reserve_week_speaking_take(u, 1::smallint, gen_random_uuid(), 'first', 'webm', '[]', '[]', null);
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'The first recording changed after the model unlocked'; end if;
  failed := false;
  begin perform public.reserve_week_speaking_check(other_user, retry3, gen_random_uuid());
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'Another learner checked a private recording'; end if;

  -- A crashed check is recovered under the user lock after the lease. Its
  -- spent check stays counted, and a late worker cannot commit over a retry.
  item := public.reserve_week_speaking_take(u, 2::smallint, week2_first, 'first', 'webm', '[]', '[]', null);
  paths := array_append(paths, item->>'path'); perform public.finish_week_speaking_upload(u, week2_first, true);
  stale_check := gen_random_uuid(); perform public.reserve_week_speaking_check(u, week2_first, stale_check);
  update public.week_speaking_flows set active_since = now() - interval '31 minutes' where user_id = u and week_number = 2;
  check_id := gen_random_uuid(); perform public.reserve_week_speaking_check(u, week2_first, check_id);
  if public.finish_week_speaking_check(u, stale_check, 'succeeded', 'Late answer.', '{}') then
    raise exception 'A stale worker was allowed to finish';
  end if;
  perform public.finish_week_speaking_check(u, check_id, 'failed', null, null);
  if (select checks_used from public.week_speaking_flows where user_id = u and week_number = 2) <> 2
    or (select status from public.week_speaking_takes where id = week2_first) <> 'ready' then
    raise exception 'Failed or stale checks did not retain the spent budget and saved take';
  end if;
  check_id := gen_random_uuid(); perform public.reserve_week_speaking_check(u, week2_first, check_id);
  perform public.finish_week_speaking_check(u, check_id, 'succeeded', 'A kept first.', '{}');
  item := public.reserve_week_speaking_take(u, 2::smallint, week2_retry1, 'retry', 'webm', '[]', '[]', null);
  paths := array_append(paths, item->>'path'); perform public.finish_week_speaking_upload(u, week2_retry1, true);
  check_id := gen_random_uuid(); perform public.reserve_week_speaking_check(u, week2_retry1, check_id);
  perform public.finish_week_speaking_check(u, check_id, 'failed', null, null);
  item := public.reserve_week_speaking_take(u, 2::smallint, failed_upload, 'retry', 'webm', '[]', '[]', null);
  paths := array_append(paths, item->>'path'); perform public.finish_week_speaking_upload(u, failed_upload, false);
  if (select status from public.week_speaking_takes where id = week2_retry1) <> 'ready' then
    raise exception 'A failed new upload made the previous saved try unavailable';
  end if;
  item := public.reserve_week_speaking_take(u, 2::smallint, week2_retry2, 'retry', 'webm', '[]', '[]', null);
  paths := array_append(paths, item->>'path'); perform public.finish_week_speaking_upload(u, week2_retry2, true);
  if (select status from public.week_speaking_takes where id = week2_retry1) <> 'abandoned' then
    raise exception 'A failed prior check should remain saved as an unchecked try';
  end if;
  check_id := gen_random_uuid(); perform public.reserve_week_speaking_check(u, week2_retry2, check_id);
  perform public.finish_week_speaking_check(u, check_id, 'succeeded', 'Another try.', '{}');
  if (select checks_used from public.week_speaking_flows where user_id = u and week_number = 2) <> 5 then
    raise exception 'Recovery must not bypass the five-check limit';
  end if;

  -- The tokenised deletion barrier excludes concurrent captures; the wrong
  -- request cannot release a newer request's lock.
  if not public.begin_week_speaking_deletion(u, lock_id) then raise exception 'Deletion barrier was not acquired'; end if;
  perform public.end_week_speaking_deletion(u, gen_random_uuid());
  failed := false;
  begin perform public.reserve_week_speaking_take(u, 2::smallint, gen_random_uuid(), 'first', 'webm', '[]', '[]', null);
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'Upload was accepted during deletion'; end if;
  perform public.end_week_speaking_deletion(u, lock_id);

  other_take := gen_random_uuid();
  item := public.reserve_week_speaking_take(other_user, 1::smallint, other_take, 'first', 'webm', '[]', '[]', null);
  perform public.finish_week_speaking_upload(other_user, other_take, true);
  if not public.begin_week_speaking_deletion(u, lock_id) then raise exception 'Deletion lock unavailable'; end if;
  failed := false;
  begin perform public.finish_week_speaking_deletion(u, gen_random_uuid());
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'A wrong deletion token was accepted'; end if;
  update public.week_speaking_deletion_locks set expires_at = clock_timestamp() - interval '1 second' where user_id = u;
  failed := false;
  begin perform public.finish_week_speaking_deletion(u, lock_id);
  exception when raise_exception then failed := true; end;
  if not failed or not exists (select 1 from public.week_speaking_takes where id = first3) then
    raise exception 'An expired deletion token removed learner data';
  end if;
  if not public.begin_week_speaking_deletion(u, lock_id) then raise exception 'Expired deletion lock could not be retried'; end if;
  perform set_config('request.jwt.claim.sub', u::text, true);
  result := public.finish_week_speaking_deletion(u, lock_id);
  foreach v_path in array paths loop
    if not (result->'audio_paths' ? v_path) then raise exception 'Delete my data omitted weekly key %: %', v_path, result; end if;
  end loop;
  if result->'audio_paths' ? (item->>'path') or not exists (select 1 from public.week_speaking_takes where id = other_take) then
    raise exception 'Deleting a learner affected another learner';
  end if;
  if exists (select 1 from public.week_speaking_takes where user_id = u)
     or exists (select 1 from public.week_speaking_flows where user_id = u)
     or exists (select 1 from public.week_speaking_checks where user_id = u) then raise exception 'Delete my data left weekly rows'; end if;
  if not (public.verify_delete_my_learning_data_coverage()->>'covered')::boolean then raise exception 'Deletion coverage guard failed'; end if;
end $$;

do $$
begin
  if has_function_privilege('authenticated', 'public.reserve_week_speaking_take(uuid,smallint,uuid,text,text,jsonb,jsonb,uuid)', 'execute')
    or has_function_privilege('anon', 'public.reserve_week_speaking_check(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.finish_week_speaking_check(uuid,uuid,text,text,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.finish_week_speaking_deletion(uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.delete_my_learning_data()', 'execute')
    or not has_function_privilege('service_role', 'public.finish_week_speaking_deletion(uuid,uuid)', 'execute') then
    raise exception 'Only the service role may change weekly speaking limits';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'week_speaking_takes' and policyname = 'week speaking takes owner read')
    or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'week_speaking_takes' and policyname = 'week speaking takes staff read') then
    raise exception 'Weekly take privacy policies are missing';
  end if;
end $$;
rollback;
