-- Run only on the disposable migration-replay database. Nothing is committed.
-- Exercise the real SQL functions, permissions, saved versions and row isolation.
\set ON_ERROR_STOP on
begin;
do $$
declare
  u uuid := gen_random_uuid(); other_user uuid := gen_random_uuid();
  first_claim jsonb; second_claim jsonb; result jsonb; token uuid; old_token uuid;
  saved public.week_sentence_practice%rowtype;
  n integer;
begin
  insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
    values (u, 'sentence-check-a@example.test', '{}', '{}', 'authenticated', 'authenticated'),
           (other_user, 'sentence-check-b@example.test', '{}', '{}', 'authenticated', 'authenticated');
  perform set_config('test.sentence_user_a', u::text, true);
  perform set_config('test.sentence_user_b', other_user::text, true);

  if has_table_privilege('anon', 'public.week_sentence_practice', 'select')
     or not has_table_privilege('authenticated', 'public.week_sentence_practice', 'select')
     or has_table_privilege('authenticated', 'public.week_sentence_practice', 'insert')
     or has_table_privilege('authenticated', 'public.week_sentence_practice', 'update')
     or has_table_privilege('authenticated', 'public.week_sentence_practice', 'delete') then
    raise exception 'Sentence table privileges are unsafe';
  end if;
  -- Learners cannot forge marks or spend/reset another learner's slots.
  if has_function_privilege('authenticated', 'public.claim_week_sentence_check(uuid,smallint,text,text,text,smallint)', 'execute')
     or has_function_privilege('anon', 'public.claim_week_sentence_check(uuid,smallint,text,text,text,smallint)', 'execute')
     or not has_function_privilege('service_role', 'public.claim_week_sentence_check(uuid,smallint,text,text,text,smallint)', 'execute')
     or has_function_privilege('authenticated', 'public.finish_week_sentence_check(uuid,smallint,text,uuid,boolean,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.finish_week_sentence_check(uuid,smallint,text,uuid,boolean,jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.finish_week_sentence_check(uuid,smallint,text,uuid,boolean,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.release_week_sentence_check(uuid,smallint,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.release_week_sentence_check(uuid,smallint,text,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.release_week_sentence_check(uuid,smallint,text,uuid)', 'execute') then
    raise exception 'Sentence check RPC privileges are unsafe';
  end if;

  -- A cross-week or wrong-kind identifier never creates a row.
  begin
    perform public.claim_week_sentence_check(u, 1::smallint, 'W2-U1', 'grammar-use-it', 'wrong week', 1::smallint);
    raise exception 'A cross-week ID was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.claim_week_sentence_check(u, 1::smallint, 'W1-U1', 'vocabulary-sentence', 'wrong kind', 1::smallint);
    raise exception 'A wrong-kind ID was accepted';
  exception when invalid_parameter_value then null;
  end;

  first_claim := public.claim_week_sentence_check(u, 1::smallint, 'W1-U1', 'grammar-use-it', 'first version', 1::smallint);
  if first_claim->>'status' <> 'claimed' or (first_claim->>'version')::int <> 1 then raise exception 'First claim failed: %', first_claim; end if;
  token := (first_claim->>'claimToken')::uuid;
  result := public.claim_week_sentence_check(u, 1::smallint, 'W1-U1', 'grammar-use-it', 'simultaneous', 1::smallint);
  if result->>'status' <> 'busy' then raise exception 'An active claim was not protected: %', result; end if;
  result := public.finish_week_sentence_check(u, 1::smallint, 'W1-U1', gen_random_uuid(), true, '{"corrected":"wrong token"}');
  if result->>'status' <> 'expired' then raise exception 'A different token could finish: %', result; end if;
  perform public.release_week_sentence_check(u, 1::smallint, 'W1-U1', gen_random_uuid());
  select * into saved from public.week_sentence_practice where user_id=u and week_number=1 and item_id='W1-U1';
  if saved.claim_token is distinct from token then raise exception 'A different token released the claim'; end if;
  perform public.release_week_sentence_check(u, 1::smallint, 'W1-U1', token);
  select * into saved from public.week_sentence_practice where user_id=u and week_number=1 and item_id='W1-U1';
  if saved.claim_token is not null or saved.draft_answer <> 'first version' or saved.first_answer is not null then
    raise exception 'A failed check did not preserve its draft without using a slot';
  end if;

  first_claim := public.claim_week_sentence_check(u, 1::smallint, 'W1-U1', 'grammar-use-it', 'first version', 1::smallint);
  token := (first_claim->>'claimToken')::uuid;
  result := public.finish_week_sentence_check(u, 1::smallint, 'W1-U1', token, false, '{"target":"Try the target.","otherPoints":[],"corrected":"first correction"}');
  if result->>'status' <> 'completed' or result->'first'->>'answer' <> 'first version' then raise exception 'First finish failed: %', result; end if;
  result := public.claim_week_sentence_check(u, 1::smallint, 'W1-U1', 'grammar-use-it', 'stale first request', 1::smallint);
  if result->>'status' <> 'stale' then raise exception 'A stale first request became a rewrite: %', result; end if;
  second_claim := public.claim_week_sentence_check(u, 1::smallint, 'W1-U1', 'grammar-use-it', 'second version', 2::smallint);
  if second_claim->>'status' <> 'claimed' or second_claim->'previous'->>'answer' <> 'first version'
      or (second_claim->'previous'->>'onTarget')::boolean then
    raise exception 'Second claim lost the first answer: %', second_claim;
  end if;
  token := (second_claim->>'claimToken')::uuid;
  begin
    perform public.finish_week_sentence_check(u, 1::smallint, 'W1-U1', token, true, '{"target":"No correction"}');
    raise exception 'Feedback without a correction was accepted';
  exception when invalid_parameter_value then null;
  end;
  result := public.finish_week_sentence_check(u, 1::smallint, 'W1-U1', token, true, '{"target":"Good.","otherPoints":[],"improved":"Better.","stillToFix":"Nothing.","corrected":"second correction"}');
  if result->>'status' <> 'completed' or result->'first'->>'answer' <> 'first version'
      or result->'second'->>'answer' <> 'second version' or (result->'second'->>'onTarget')::boolean is not true then
    raise exception 'Second finish did not preserve both versions: %', result;
  end if;
  result := public.claim_week_sentence_check(u, 1::smallint, 'W1-U1', 'grammar-use-it', 'third version', 2::smallint);
  if result->>'status' <> 'limit' then raise exception 'A third check was allowed: %', result; end if;
  select count(*) into n from public.week_grammar_attempts where user_id=u and week_number=1 and item_id='W1-U1';
  if n <> 2 then raise exception 'Both saved versions must also record practice marks: %', n; end if;

  -- A stale lease cannot overwrite its replacement; a different item remains usable.
  first_claim := public.claim_week_sentence_check(u, 1::smallint, 'W1-U2', 'grammar-use-it', 'old lease', 1::smallint);
  old_token := (first_claim->>'claimToken')::uuid;
  update public.week_sentence_practice set claimed_at=clock_timestamp()-interval '6 minutes'
    where user_id=u and week_number=1 and item_id='W1-U2';
  second_claim := public.claim_week_sentence_check(u, 1::smallint, 'W1-U2', 'grammar-use-it', 'new lease', 1::smallint);
  token := (second_claim->>'claimToken')::uuid;
  if second_claim->>'status' <> 'claimed' or token=old_token then raise exception 'An expired claim could not be retried'; end if;
  result := public.finish_week_sentence_check(u, 1::smallint, 'W1-U2', old_token, true, '{"corrected":"old"}');
  if result->>'status' <> 'expired' then raise exception 'An old claim overwrote the new one'; end if;
  result := public.finish_week_sentence_check(u, 1::smallint, 'W1-U2', token, true, '{"corrected":"new"}');
  if result->>'status' <> 'completed' then raise exception 'New lease did not finish'; end if;

  first_claim := public.claim_week_sentence_check(other_user, 1::smallint, 'V1-S1', 'vocabulary-sentence', 'another learner', 1::smallint);
  result := public.finish_week_sentence_check(other_user, 1::smallint, 'V1-S1', (first_claim->>'claimToken')::uuid, true, '{"corrected":"another learner"}');
  if result->>'status' <> 'completed' then raise exception 'Vocabulary finish failed: %', result; end if;
  second_claim := public.claim_week_sentence_check(other_user, 1::smallint, 'V1-S1', 'vocabulary-sentence', 'another version', 2::smallint);
  result := public.finish_week_sentence_check(other_user, 1::smallint, 'V1-S1', (second_claim->>'claimToken')::uuid, true, '{"corrected":"another version"}');
  if result->'first'->>'answer' <> 'another learner' or result->'second'->>'answer' <> 'another version' then
    raise exception 'Vocabulary versions were not both preserved: %', result;
  end if;
  result := public.claim_week_sentence_check(other_user, 1::smallint, 'V1-S1', 'vocabulary-sentence', 'third', 2::smallint);
  if result->>'status' <> 'limit' then raise exception 'A third vocabulary check was allowed'; end if;
  select count(*) into n from public.week_vocabulary_attempts where user_id=other_user and item_id='V1-S1';
  if n <> 2 then raise exception 'Both vocabulary progress marks were not recorded'; end if;
end $$;

-- Use the actual authenticated role and JWT subject for both owner and foreign
-- reads. Row filtering must still work when a client asks for another user_id.
select set_config('request.jwt.claim.sub', current_setting('test.sentence_user_a'), true);
set local role authenticated;
do $$
declare own_count integer; foreign_count integer;
begin
  select count(*) into own_count from public.week_sentence_practice where user_id=current_setting('test.sentence_user_a')::uuid;
  select count(*) into foreign_count from public.week_sentence_practice where user_id=current_setting('test.sentence_user_b')::uuid;
  if own_count <> 2 or foreign_count <> 0 then raise exception 'Sentence row isolation failed: own %, foreign %', own_count, foreign_count; end if;
end $$;
reset role;
rollback;
