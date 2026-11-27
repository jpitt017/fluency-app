-- Durable weekly speaking: one flow per learner/week, a private object ledger,
-- and atomic limits. Existing 0060 attempts and their two keys are retained.
-- No audio is made public and no course-audio release state is changed.

create table public.week_speaking_flows (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 4),
  attempt_id uuid not null unique references public.week_speaking_attempts(id) on delete cascade,
  first_take_id uuid,
  first_versions smallint not null default 0 check (first_versions between 0 and 3),
  retry_count smallint not null default 0 check (retry_count between 0 and 3),
  checks_used smallint not null default 0 check (checks_used between 0 and 5),
  model_unlocked boolean not null default false,
  active_upload_id uuid,
  active_check_id uuid,
  active_since timestamptz,
  primary key (user_id, week_number)
);

create table public.week_speaking_takes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 4),
  attempt_id uuid not null references public.week_speaking_attempts(id) on delete cascade,
  kind text not null check (kind in ('first', 'retry', 'structure')),
  sequence smallint not null check (sequence between 1 and 3),
  source_take_id uuid references public.week_speaking_takes(id) on delete cascade,
  recording_path text not null unique,
  status text not null default 'uploading' check (status in ('uploading', 'upload_failed', 'ready', 'checking', 'checked', 'abandoned')),
  notes jsonb not null default '[]'::jsonb check (jsonb_typeof(notes) = 'array'),
  selected_phrases jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_phrases) = 'array' and jsonb_array_length(selected_phrases) <= 2),
  transcript text,
  feedback jsonb,
  created_at timestamptz not null default now()
);
create index week_speaking_takes_owner_week on public.week_speaking_takes(user_id, week_number, created_at);

create table public.week_speaking_checks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 4),
  take_id uuid not null references public.week_speaking_takes(id) on delete cascade,
  status text not null default 'reserved' check (status in ('reserved', 'succeeded', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- A short-lived barrier stops new captures while Delete my data is removing
-- Storage objects. The route releases it even on failure; a crashed route can
-- be retried after the lease. Active uploads/checks must finish first.
create table public.week_speaking_deletion_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lock_id uuid not null,
  expires_at timestamptz not null
);

alter table public.week_speaking_flows enable row level security;
alter table public.week_speaking_takes enable row level security;
alter table public.week_speaking_checks enable row level security;
alter table public.week_speaking_deletion_locks enable row level security;
revoke all on public.week_speaking_flows, public.week_speaking_takes, public.week_speaking_checks, public.week_speaking_deletion_locks from public, anon, authenticated;
grant select on public.week_speaking_flows, public.week_speaking_takes, public.week_speaking_checks to authenticated;
grant all on public.week_speaking_flows, public.week_speaking_takes, public.week_speaking_checks, public.week_speaking_deletion_locks to service_role;
create policy "week speaking flows owner read" on public.week_speaking_flows for select to authenticated using (user_id = auth.uid());
create policy "week speaking takes owner read" on public.week_speaking_takes for select to authenticated using (user_id = auth.uid());
create policy "week speaking checks owner read" on public.week_speaking_checks for select to authenticated using (user_id = auth.uid());
create policy "week speaking takes staff read" on public.week_speaking_takes for select to authenticated using (public.is_staff());

-- 0062's policy counted the filename as a folder. Both old and new weekly
-- keys have four folder components; staff still get read-only access only.
drop policy if exists "week speaking recordings staff read" on storage.objects;
create policy "week speaking recordings staff read" on storage.objects for select to authenticated using (
  bucket_id = 'speaking-recordings'
  and array_length(storage.foldername(name), 1) >= 4
  and (storage.foldername(name))[2] = 'week-speaking'
  and public.is_staff()
);

-- Existing learners keep the latest attempt and all legacy audio. Count old
-- evaluations conservatively across every historic attempt (capped at five).
insert into public.week_speaking_flows
  (user_id, week_number, attempt_id, first_versions, retry_count, checks_used, model_unlocked)
select latest.user_id, latest.week_number, latest.id, 1,
  case when latest.second_recording_path is not null then 1 else 0 end,
  least(5, (select coalesce(sum((a.first_recording_path is not null)::int + (a.second_recording_path is not null)::int), 0)
            from public.week_speaking_attempts a where a.user_id = latest.user_id and a.week_number = latest.week_number)),
  true
from (
  select distinct on (user_id, week_number) * from public.week_speaking_attempts
  where first_recording_path is not null and first_transcript is not null
  order by user_id, week_number, created_at desc, id desc
) latest;

-- Serialise all weekly speaking mutations and deletion for the same user. A
-- stale reservation is retained in the ledger but can be recovered after 30
-- minutes; a late worker must not finalise a reservation that has been cleared.
create function public.week_speaking_recover_stale(p_user_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.week_speaking_takes t set status = 'upload_failed'
  from public.week_speaking_flows f
  where f.user_id = p_user_id and f.active_upload_id = t.id and f.active_since < now() - interval '30 minutes';
  update public.week_speaking_takes t set status = 'ready'
  from public.week_speaking_flows f
  where f.user_id = p_user_id and f.active_check_id is not null and f.active_since < now() - interval '30 minutes'
    and t.id = (select c.take_id from public.week_speaking_checks c where c.id = f.active_check_id);
  update public.week_speaking_checks c set status = 'failed', finished_at = now()
  from public.week_speaking_flows f
  where f.user_id = p_user_id and f.active_check_id = c.id and f.active_since < now() - interval '30 minutes';
  update public.week_speaking_flows set active_upload_id = null, active_check_id = null, active_since = null
  where user_id = p_user_id and active_since < now() - interval '30 minutes';
end $$;

create function public.reserve_week_speaking_take(
  p_user_id uuid, p_week_number smallint, p_take_id uuid, p_kind text, p_extension text,
  p_notes jsonb, p_phrases jsonb, p_source_take_id uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  f public.week_speaking_flows%rowtype;
  a public.week_speaking_attempts%rowtype;
  v_sequence smallint;
  v_path text;
begin
  if p_user_id is null or p_take_id is null or p_week_number not between 1 and 4
     or p_kind not in ('first', 'retry', 'structure') or p_extension not in ('webm', 'ogg', 'm4a')
     or jsonb_typeof(p_notes) <> 'array' or jsonb_typeof(p_phrases) <> 'array' or jsonb_array_length(p_phrases) > 2 then
    raise exception 'Invalid weekly speaking recording' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  perform public.week_speaking_recover_stale(p_user_id);
  if exists (select 1 from public.week_speaking_deletion_locks where user_id = p_user_id and expires_at > now()) then
    raise exception 'Data deletion is in progress' using errcode = 'P0001';
  end if;
  select * into f from public.week_speaking_flows where user_id = p_user_id and week_number = p_week_number for update;
  if not found then
    -- An older app instance can still save a legacy attempt between applying
    -- this migration and deploying the new app. Adopt its latest complete row
    -- lazily under the same user lock, without deleting or rewriting it.
    select * into a from public.week_speaking_attempts
      where user_id = p_user_id and week_number = p_week_number
        and first_recording_path is not null and first_transcript is not null
      order by created_at desc, id desc limit 1;
    if found then
      insert into public.week_speaking_flows(user_id, week_number, attempt_id, first_versions, retry_count, checks_used, model_unlocked)
        values (p_user_id, p_week_number, a.id, 1, case when a.second_recording_path is not null then 1 else 0 end,
          least(5, (select coalesce(sum((old.first_recording_path is not null)::int + (old.second_recording_path is not null)::int), 0)
            from public.week_speaking_attempts old where old.user_id = p_user_id and old.week_number = p_week_number)), true)
        returning * into f;
    else
      if p_kind <> 'first' then raise exception 'Record the first answer first' using errcode = 'P0001'; end if;
      insert into public.week_speaking_attempts(id, user_id, week_number, notes)
        values (gen_random_uuid(), p_user_id, p_week_number, p_notes) returning * into a;
      insert into public.week_speaking_flows(user_id, week_number, attempt_id)
        values (p_user_id, p_week_number, a.id) returning * into f;
    end if;
  end if;
  if f.active_upload_id is not null or f.active_check_id is not null then
    raise exception 'A recording or check is already in progress' using errcode = 'P0001';
  end if;
  if p_kind = 'first' then
    if f.model_unlocked or f.first_versions >= 3 or f.checks_used >= 5 then raise exception 'First recording limit reached' using errcode = 'P0001'; end if;
    v_sequence := f.first_versions + 1;
  elsif p_kind = 'retry' then
    if not f.model_unlocked or f.retry_count >= 3 or f.checks_used >= 5 then
      raise exception 'No more weekly tries are available' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.week_speaking_takes t where t.user_id = p_user_id and t.week_number = p_week_number
        and t.kind = 'retry' and t.status in ('ready', 'checking') and not exists (
          select 1 from public.week_speaking_checks c where c.take_id = t.id and c.status = 'failed'
        )
    ) then raise exception 'Check the previous try first' using errcode = 'P0001'; end if;
    -- A failed check may be left behind, but only after the replacement
    -- upload succeeds. Until then the previous recording stays checkable.
    v_sequence := f.retry_count + 1;
  else
    if not f.model_unlocked or f.checks_used >= 5 or not exists (
      select 1 from public.week_speaking_takes where id = p_source_take_id and user_id = p_user_id
        and week_number = p_week_number and kind in ('first', 'retry') and status = 'checked'
    ) or exists (
      select 1 from public.week_speaking_takes where user_id = p_user_id and source_take_id = p_source_take_id
        and kind = 'structure' and status <> 'upload_failed'
    ) then raise exception 'This sentence cannot be checked again' using errcode = 'P0001'; end if;
    v_sequence := 1;
  end if;
  v_path := p_user_id::text || '/week-speaking/' || p_week_number::text || '/' || f.attempt_id::text || '/recording-' || p_take_id::text || '.' || p_extension;
  insert into public.week_speaking_takes(id, user_id, week_number, attempt_id, kind, sequence, source_take_id, recording_path, notes, selected_phrases)
    values (p_take_id, p_user_id, p_week_number, f.attempt_id, p_kind, v_sequence, p_source_take_id, v_path, p_notes, p_phrases);
  update public.week_speaking_flows set active_upload_id = p_take_id, active_since = now()
    where user_id = p_user_id and week_number = p_week_number;
  return jsonb_build_object('takeId', p_take_id, 'attemptId', f.attempt_id, 'path', v_path, 'sequence', v_sequence);
end $$;

create function public.finish_week_speaking_upload(p_user_id uuid, p_take_id uuid, p_success boolean)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare t public.week_speaking_takes%rowtype; f public.week_speaking_flows%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into t from public.week_speaking_takes where id = p_take_id and user_id = p_user_id for update;
  if not found then return false; end if;
  select * into f from public.week_speaking_flows where user_id = p_user_id and week_number = t.week_number for update;
  if not found or f.active_upload_id is distinct from p_take_id or t.status <> 'uploading' then return false; end if;
  update public.week_speaking_takes set status = case when p_success then 'ready' else 'upload_failed' end where id = p_take_id;
  if p_success then
    if t.kind = 'first' then
      update public.week_speaking_flows set first_take_id = t.id, first_versions = first_versions + 1 where user_id = p_user_id and week_number = t.week_number;
      update public.week_speaking_attempts set notes = t.notes where id = t.attempt_id and user_id = p_user_id;
    elsif t.kind = 'retry' then
      update public.week_speaking_takes set status = 'abandoned'
        where user_id = p_user_id and week_number = t.week_number and kind = 'retry' and status = 'ready' and id <> t.id;
      update public.week_speaking_flows set retry_count = retry_count + 1 where user_id = p_user_id and week_number = t.week_number;
    end if;
  end if;
  update public.week_speaking_flows set active_upload_id = null, active_since = null where user_id = p_user_id and week_number = t.week_number;
  return true;
end $$;

create function public.reserve_week_speaking_check(p_user_id uuid, p_take_id uuid, p_check_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare t public.week_speaking_takes%rowtype; f public.week_speaking_flows%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  perform public.week_speaking_recover_stale(p_user_id);
  if exists (select 1 from public.week_speaking_deletion_locks where user_id = p_user_id and expires_at > now()) then
    raise exception 'Data deletion is in progress' using errcode = 'P0001';
  end if;
  select * into t from public.week_speaking_takes where id = p_take_id and user_id = p_user_id for update;
  if not found then raise exception 'Recording not found' using errcode = 'P0001'; end if;
  select * into f from public.week_speaking_flows where user_id = p_user_id and week_number = t.week_number for update;
  if not found or f.active_upload_id is not null or f.active_check_id is not null or f.checks_used >= 5
     or t.status <> 'ready' or (t.kind = 'first' and (f.model_unlocked or f.first_take_id is distinct from t.id))
     or (t.kind in ('retry', 'structure') and not f.model_unlocked) then
    raise exception 'This recording cannot be checked now' using errcode = 'P0001';
  end if;
  insert into public.week_speaking_checks(id, user_id, week_number, take_id) values (p_check_id, p_user_id, t.week_number, t.id);
  update public.week_speaking_takes set status = 'checking' where id = t.id;
  update public.week_speaking_flows set checks_used = checks_used + 1, active_check_id = p_check_id, active_since = now()
    where user_id = p_user_id and week_number = t.week_number;
  return jsonb_build_object('path', t.recording_path, 'kind', t.kind, 'week', t.week_number,
    'attemptId', t.attempt_id, 'sourceTakeId', t.source_take_id, 'sequence', t.sequence);
end $$;

create function public.finish_week_speaking_check(
  p_user_id uuid, p_check_id uuid, p_status text, p_transcript text default null, p_feedback jsonb default null
) returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare c public.week_speaking_checks%rowtype; t public.week_speaking_takes%rowtype; f public.week_speaking_flows%rowtype;
begin
  if p_status not in ('succeeded', 'failed', 'cancelled') then raise exception 'Invalid check result' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into c from public.week_speaking_checks where id = p_check_id and user_id = p_user_id for update;
  if not found or c.status <> 'reserved' then return false; end if;
  select * into f from public.week_speaking_flows where user_id = p_user_id and week_number = c.week_number for update;
  if not found or f.active_check_id is distinct from p_check_id then return false; end if;
  select * into t from public.week_speaking_takes where id = c.take_id and user_id = p_user_id for update;
  if not found or t.status <> 'checking' then return false; end if;
  if p_status = 'succeeded' and (coalesce(trim(p_transcript), '') = '' or jsonb_typeof(p_feedback) <> 'object') then
    raise exception 'A successful check needs a transcript and feedback' using errcode = '22023';
  end if;
  update public.week_speaking_checks set status = p_status, finished_at = now() where id = c.id;
  update public.week_speaking_takes set status = case when p_status = 'succeeded' then 'checked' else 'ready' end,
    transcript = case when p_status = 'succeeded' then p_transcript else transcript end,
    feedback = case when p_status = 'succeeded' then p_feedback else feedback end where id = t.id;
  if p_status = 'succeeded' and t.kind = 'first' then
    update public.week_speaking_attempts set first_recording_path = t.recording_path, first_transcript = p_transcript,
      first_feedback = p_feedback where id = t.attempt_id and user_id = p_user_id;
    insert into public.week_output_submissions(user_id, week_number, skill) values (p_user_id, t.week_number, 'speaking')
      on conflict (user_id, week_number, skill) do nothing;
    update public.week_speaking_flows set model_unlocked = true where user_id = p_user_id and week_number = t.week_number;
  end if;
  update public.week_speaking_flows set active_check_id = null, active_since = null,
    checks_used = case when p_status = 'cancelled' then checks_used - 1 else checks_used end
    where user_id = p_user_id and week_number = t.week_number;
  return true;
end $$;

create function public.begin_week_speaking_deletion(p_user_id uuid, p_lock_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  perform public.week_speaking_recover_stale(p_user_id);
  if exists (select 1 from public.week_speaking_flows where user_id = p_user_id and (active_upload_id is not null or active_check_id is not null))
     or exists (select 1 from public.week_speaking_deletion_locks where user_id = p_user_id and expires_at > now()) then return false; end if;
  insert into public.week_speaking_deletion_locks(user_id, lock_id, expires_at) values (p_user_id, p_lock_id, now() + interval '30 minutes')
    on conflict (user_id) do update set lock_id = excluded.lock_id, expires_at = excluded.expires_at;
  return true;
end $$;
create function public.end_week_speaking_deletion(p_user_id uuid, p_lock_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  delete from public.week_speaking_deletion_locks where user_id = p_user_id and lock_id = p_lock_id;
end $$;

-- A stalled Storage request can outlive its upload lease. Check the immutable
-- key again inside Storage's metadata transaction, under the same user lock as
-- deletion. A late object can never acquire visible metadata after its ledger
-- was recovered or deleted. Guard all updates too: Storage upserts can change
-- the object version/metadata without mentioning its name. Other buckets and
-- legacy recording keys are not affected. The Storage API remains responsible
-- for cleaning failed uploads.
create function public.guard_week_speaking_storage_object()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_user uuid;
  v_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/week-speaking/[1-4]/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/recording-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|ogg|m4a)$';
begin
  if tg_op = 'UPDATE' and old.bucket_id = 'speaking-recordings' and old.name ~* v_pattern
     and (new.bucket_id is distinct from old.bucket_id or new.name is distinct from old.name) then
    raise exception 'Weekly speaking keys cannot be moved' using errcode = 'P0001';
  end if;
  if new.bucket_id is distinct from 'speaking-recordings' or coalesce(new.name, '') !~* v_pattern then
    return new;
  end if;
  v_user := split_part(new.name, '/', 1)::uuid;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  if exists (select 1 from public.week_speaking_deletion_locks where user_id = v_user and expires_at > clock_timestamp())
     or not exists (
       select 1 from public.week_speaking_takes t join public.week_speaking_flows f
         on f.user_id = t.user_id and f.week_number = t.week_number and f.active_upload_id = t.id
       where t.user_id = v_user and t.recording_path = new.name and t.status = 'uploading'
         and f.active_since >= clock_timestamp() - interval '30 minutes'
     ) then
    raise exception 'Weekly speaking upload is no longer active' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_week_speaking_storage_object
  before insert or update on storage.objects
  for each row execute function public.guard_week_speaking_storage_object();

revoke all on function public.guard_week_speaking_storage_object() from public, anon, authenticated;
revoke all on function public.week_speaking_recover_stale(uuid) from public, anon, authenticated;
revoke all on function public.reserve_week_speaking_take(uuid,smallint,uuid,text,text,jsonb,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.finish_week_speaking_upload(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.reserve_week_speaking_check(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.finish_week_speaking_check(uuid,uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.begin_week_speaking_deletion(uuid,uuid) from public, anon, authenticated;
revoke all on function public.end_week_speaking_deletion(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_week_speaking_take(uuid,smallint,uuid,text,text,jsonb,jsonb,uuid) to service_role;
grant execute on function public.finish_week_speaking_upload(uuid,uuid,boolean) to service_role;
grant execute on function public.reserve_week_speaking_check(uuid,uuid,uuid) to service_role;
grant execute on function public.finish_week_speaking_check(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.begin_week_speaking_deletion(uuid,uuid) to service_role;
grant execute on function public.end_week_speaking_deletion(uuid,uuid) to service_role;

-- Preserve the live deletion body rather than replacing it with a stale copy.
-- Collect new object keys before deleting rows, and include each user-owned
-- table explicitly so the existing coverage guard can verify it.
do $$
declare
  definition text;
  anchor text := '  if to_regclass(''public.week_speaking_attempts'') is not null then';
  branch text := $branch$
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  if exists (select 1 from public.week_speaking_flows where user_id = v_uid and (active_upload_id is not null or active_check_id is not null)) then
    raise exception 'A weekly speaking recording is in progress';
  end if;
  select coalesce(v_audio_paths, '{}'::text[]) || coalesce(array_agg(recording_path), '{}'::text[])
    into v_audio_paths from public.week_speaking_takes where user_id = v_uid;
  delete from public.week_speaking_checks where user_id = v_uid;
  delete from public.week_speaking_takes where user_id = v_uid;
  delete from public.week_speaking_flows where user_id = v_uid;
  delete from public.week_speaking_deletion_locks where user_id = v_uid;
$branch$;
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position(anchor in definition) = 0 then raise exception 'Weekly deletion anchor missing'; end if;
  if position('public.week_speaking_takes' in definition) = 0 then
    execute replace(definition, anchor, branch || chr(10) || anchor);
  end if;
  if not (public.verify_delete_my_learning_data_coverage()->>'covered')::boolean then
    raise exception 'Deletion coverage failed: %', public.verify_delete_my_learning_data_coverage();
  end if;
end $$;

-- Deleting rows without first deleting Storage would orphan their objects.
-- Route all user-facing deletion through a service-only wrapper that verifies
-- the exact, unexpired barrier token immediately before the database delete.
-- The auth subject is set only inside this transaction for the existing RPC.
create function public.finish_week_speaking_deletion(p_user_id uuid, p_lock_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_user_id is null or p_lock_id is null then raise exception 'Invalid deletion request' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if not exists (select 1 from public.week_speaking_deletion_locks
    where user_id = p_user_id and lock_id = p_lock_id and expires_at > clock_timestamp()) then
    raise exception 'Deletion lease expired; please try again' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.week_speaking_flows where user_id = p_user_id and (active_upload_id is not null or active_check_id is not null)) then
    raise exception 'A weekly speaking recording is in progress' using errcode = 'P0001';
  end if;
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  return public.delete_my_learning_data();
end $$;
revoke all on function public.finish_week_speaking_deletion(uuid,uuid) from public, anon, authenticated;
grant execute on function public.finish_week_speaking_deletion(uuid,uuid) to service_role;
revoke all on function public.delete_my_learning_data() from public, anon, authenticated;
grant execute on function public.delete_my_learning_data() to service_role;

notify pgrst, 'reload schema';
