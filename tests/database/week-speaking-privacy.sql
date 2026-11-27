-- Fresh local Supabase/replay database only; all synthetic fixtures roll back.
-- This exercises PostgreSQL RLS and Storage metadata, not the Storage service.
\set ON_ERROR_STOP on
begin;
do $$
declare
  owner_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid(); staff_id uuid := gen_random_uuid();
  owner_take uuid := gen_random_uuid(); other_take uuid := gen_random_uuid(); late_take uuid := gen_random_uuid();
  deletion_lock uuid := gen_random_uuid(); owner_path text; other_path text; late_path text; legacy_path text; secret_path text;
  denied boolean;
begin
  insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data, aud, role) values
    (owner_id, 'speaking-privacy-owner@example.test', '{}', '{}', 'authenticated', 'authenticated'),
    (other_id, 'speaking-privacy-other@example.test', '{}', '{}', 'authenticated', 'authenticated'),
    (staff_id, 'speaking-privacy-staff@example.test', '{}', '{}', 'authenticated', 'authenticated');
  update public.profiles set role = 'teacher' where id = staff_id;

  owner_path := public.reserve_week_speaking_take(owner_id, 1::smallint, owner_take, 'first', 'webm', '[]', '[]', null)->>'path';
  insert into storage.objects(bucket_id, name) values ('speaking-recordings', owner_path);
  perform public.finish_week_speaking_upload(owner_id, owner_take, true);
  denied := false;
  begin update storage.objects set name = owner_id::text || '/moved.webm' where bucket_id = 'speaking-recordings' and name = owner_path;
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'A saved weekly recording was moved out of its ledger'; end if;
  -- Storage upsert updates metadata/version without changing the key. This
  -- must not silently replace a recording after the learner has checked it.
  denied := false;
  begin update storage.objects set metadata = '{"mimetype":"audio/webm"}'::jsonb where bucket_id = 'speaking-recordings' and name = owner_path;
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'A saved weekly recording was overwritten'; end if;
  other_path := public.reserve_week_speaking_take(other_id, 1::smallint, other_take, 'first', 'webm', '[]', '[]', null)->>'path';
  insert into storage.objects(bucket_id, name) values ('speaking-recordings', other_path);
  perform public.finish_week_speaking_upload(other_id, other_take, true);
  legacy_path := owner_id::text || '/week-speaking/1/' || gen_random_uuid()::text || '/take-1.webm';
  secret_path := owner_id::text || '/some-other-recording.webm';
  insert into storage.objects(bucket_id, name) values
    ('speaking-recordings', legacy_path), ('speaking-recordings', secret_path);

  -- A delayed Storage insertion after the lease expires must be rejected even
  -- before another request cleans up the stale reservation.
  late_path := public.reserve_week_speaking_take(owner_id, 2::smallint, late_take, 'first', 'webm', '[]', '[]', null)->>'path';
  update public.week_speaking_flows set active_since = clock_timestamp() - interval '31 minutes'
    where user_id = owner_id and week_number = 2;
  denied := false;
  begin insert into storage.objects(bucket_id, name) values ('speaking-recordings', late_path);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'An expired upload was accepted by Storage metadata'; end if;
  if not public.begin_week_speaking_deletion(owner_id, deletion_lock) then raise exception 'Stale upload blocked deletion'; end if;
  denied := false;
  begin insert into storage.objects(bucket_id, name) values ('speaking-recordings', late_path);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'A late upload was accepted during deletion'; end if;

  perform set_config('test.week_owner', owner_id::text, true);
  perform set_config('test.week_other', other_id::text, true);
  perform set_config('test.week_staff', staff_id::text, true);
  perform set_config('test.week_owner_take', owner_take::text, true);
  perform set_config('test.week_other_take', other_take::text, true);
  perform set_config('test.week_owner_path', owner_path, true);
  perform set_config('test.week_other_path', other_path, true);
  perform set_config('test.week_legacy_path', legacy_path, true);
  perform set_config('test.week_secret_path', secret_path, true);
  perform set_config('test.week_late_path', late_path, true);
  perform set_config('test.week_delete_lock', deletion_lock::text, true);
end $$;

-- Test as the real authenticated role, not as a table owner / service role.
select set_config('request.jwt.claim.sub', current_setting('test.week_owner'), true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.week_speaking_takes where id = current_setting('test.week_owner_take')::uuid) <> 1
     or (select count(*) from public.week_speaking_takes where id = current_setting('test.week_other_take')::uuid) <> 0
     or (select count(*) from storage.objects where bucket_id = 'speaking-recordings' and name = current_setting('test.week_owner_path')) <> 1
     or (select count(*) from storage.objects where bucket_id = 'speaking-recordings' and name = current_setting('test.week_other_path')) <> 0 then
    raise exception 'Weekly owner/foreign RLS isolation failed';
  end if;
  if has_function_privilege('authenticated', 'public.delete_my_learning_data()', 'execute')
     or has_function_privilege('authenticated', 'public.finish_week_speaking_deletion(uuid,uuid)', 'execute') then
    raise exception 'A learner can bypass Storage deletion and the service-only barrier';
  end if;
end $$;
reset role;

-- A different staff user may read weekly objects and rows, including old
-- four-folder keys, but must not gain access to other speaking files.
select set_config('request.jwt.claim.sub', current_setting('test.week_staff'), true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.week_speaking_takes where id = current_setting('test.week_owner_take')::uuid) <> 1
     or (select count(*) from storage.objects where bucket_id = 'speaking-recordings' and name = current_setting('test.week_owner_path')) <> 1
     or (select count(*) from storage.objects where bucket_id = 'speaking-recordings' and name = current_setting('test.week_legacy_path')) <> 1
     or (select count(*) from storage.objects where bucket_id = 'speaking-recordings' and name = current_setting('test.week_secret_path')) <> 0 then
    raise exception 'Staff weekly-read / non-weekly isolation failed';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'speaking-recordings' and name = current_setting('test.week_owner_path')) <> 0
     or has_table_privilege('anon', 'public.week_speaking_takes', 'select') then
    raise exception 'Anonymous access exposed a weekly take';
  end if;
end $$;
reset role;

-- Deleting the ledger before an already-stalled request completes must not
-- let it recreate visible Storage metadata. No real objects are used here.
do $$
declare denied boolean := false;
begin
  perform public.finish_week_speaking_deletion(current_setting('test.week_owner')::uuid, current_setting('test.week_delete_lock')::uuid);
  begin insert into storage.objects(bucket_id, name) values ('speaking-recordings', current_setting('test.week_late_path'));
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'A late upload was accepted after deletion'; end if;
end $$;
rollback;
