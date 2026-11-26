-- Fresh-replay coverage for weekly speaking recordings. Included from
-- verify-replay-schema.sql so the isolated deletion job runs it before the
-- general learner-data deletion test. Everything is rolled back.
\set ON_ERROR_STOP on
begin;
do $$
declare
  u uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
  attempt uuid := gen_random_uuid();
  other_attempt uuid := gen_random_uuid();
  path1 text;
  path2 text;
  other_path text;
  result jsonb;
begin
  insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
    values
      (u, 'weekly-recording-delete@example.test', '{}', '{}', 'authenticated', 'authenticated'),
      (other_user, 'weekly-recording-other@example.test', '{}', '{}', 'authenticated', 'authenticated');

  path1 := u::text || '/week-speaking/1/' || attempt::text || '/take-1.webm';
  path2 := u::text || '/week-speaking/1/' || attempt::text || '/take-2.webm';
  other_path := other_user::text || '/week-speaking/1/' || other_attempt::text || '/take-1.webm';

  insert into public.week_speaking_attempts
    (id, user_id, week_number, notes, first_recording_path, first_transcript, second_recording_path, second_transcript)
    values
      (attempt, u, 1, '[]'::jsonb, path1, 'first take', path2, 'second take'),
      (other_attempt, other_user, 1, '[]'::jsonb, other_path, 'another learner', null, null);

  perform set_config('request.jwt.claim.sub', u::text, true);
  result := public.delete_my_learning_data();

  if result->>'deleted' <> 'true' then
    raise exception 'Delete my data did not complete: %', result;
  end if;
  if not (result->'audio_paths' ? path1) or not (result->'audio_paths' ? path2) then
    raise exception 'Both weekly recording paths must be covered by Delete my data: %', result;
  end if;
  if result->'audio_paths' ? other_path then
    raise exception 'Deleting one learner reported another learner''s recording: %', result;
  end if;
  if exists (select 1 from public.week_speaking_attempts where user_id = u) then
    raise exception 'Weekly speaking rows survived Delete my data';
  end if;
  if not exists (select 1 from public.week_speaking_attempts where id = other_attempt and user_id = other_user) then
    raise exception 'Deleting one learner removed another learner''s weekly speaking row';
  end if;
  if not (public.verify_delete_my_learning_data_coverage()->>'covered')::boolean then
    raise exception 'Deletion coverage check failed: %', public.verify_delete_my_learning_data_coverage();
  end if;
end $$;

do $$
begin
  if exists (select 1 from storage.buckets where id = 'speaking-recordings' and public) then
    raise exception 'speaking-recordings must be private';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'week_speaking_attempts'
      and policyname = 'week speaking attempts staff read'
      and qual::text like '%is_staff%'
  ) then
    raise exception 'Staff weekly attempt RLS policy is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'week speaking recordings staff read'
      and qual::text like '%week-speaking%'
      and qual::text like '%is_staff%'
  ) then
    raise exception 'Staff weekly recording RLS policy is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'recordings own read'
  ) then
    raise exception 'Owner-only recording RLS policy is missing';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and array_position(roles, 'anon'::name) is not null
      and (
        coalesce(qual::text, '') like '%speaking-recordings%'
        or coalesce(with_check::text, '') like '%speaking-recordings%'
      )
  ) then
    raise exception 'An anonymous policy must not expose speaking-recordings';
  end if;
  if position('public.week_speaking_attempts' in pg_get_functiondef('public.delete_my_learning_data()'::regprocedure)) = 0
     or position('first_recording_path' in pg_get_functiondef('public.delete_my_learning_data()'::regprocedure)) = 0
     or position('second_recording_path' in pg_get_functiondef('public.delete_my_learning_data()'::regprocedure)) = 0 then
    raise exception 'Delete my data definition must include both weekly recording paths';
  end if;
end $$;
rollback;
