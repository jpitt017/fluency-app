-- Retryable learning-data deletion, additive to 0080. The old RPCs and their
-- finite locks remain usable by an old application. A durable job reuses the
-- 0080 lock row so a new application can also run with the 0080 schema.
--
-- A job has an expiry in year 6000 or later. The special 9999 date is idle;
-- a worker claim is its real deadline shifted by 4,800 Gregorian years. A
-- crashed worker's claim can be recovered, without ever expiring the barrier.
-- Old-schema fallback retains the old schema's issue-upload race; see rollout
-- notes. Do not enable the legacy fence until all old app instances retire.

-- The new app must also issue durable, disjoint recording keys on 0080. Its
-- compatibility path consumes the existing ownerless AI-log identity; abort
-- expansion if that identity has drifted into a form that could reuse values.
-- This does not replace a live preflight of service-role grants and sequence
-- recovery state before any production deployment.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_attribute a
    join pg_catalog.pg_sequence s
      on s.seqrelid = pg_get_serial_sequence('public.ai_request_logs', 'id')::regclass
    where a.attrelid = 'public.ai_request_logs'::regclass and a.attname = 'id'
      and a.attidentity = 'a' and a.atttypid = 'pg_catalog.int8'::regtype
      and s.seqincrement > 0 and s.seqmin >= 1 and not s.seqcycle
  ) then raise exception 'The 0080 recording-key compatibility identity is not safe'; end if;
end $$;

-- The account is intentionally retained on learning-data deletion. These
-- two small security markers let the service reject stale uploads and clean
-- up late files without mistaking new, generation-tagged work for old work.
alter table public.profiles add column data_deletion_generation uuid not null default gen_random_uuid();
alter table public.profiles add column data_deletion_completed_at timestamptz;
alter table public.issue_reports add column data_deletion_generation uuid;
-- Cached AI feedback can contain learner text. The pre-0081 cache was shared
-- and had no owner, so its entries cannot be attributed reliably. Discard that
-- expendable cache once, then scope future entries to the authenticated owner.
-- This is a data-changing rollout step and needs the owner's approval.
alter table public.ai_evaluation_cache add column cache_owner_id uuid references auth.users(id) on delete cascade;
create index ai_evaluation_cache_owner_idx on public.ai_evaluation_cache(cache_owner_id);
delete from public.ai_evaluation_cache where cache_owner_id is null;
-- A fresh random claim fences workers even if two lease timestamps coincide.
-- 0080 clients ignore this additive column.
alter table public.week_speaking_deletion_locks add column retry_claim uuid;

create table public.data_deletion_safety_config (
  singleton boolean primary key default true check (singleton),
  enforce_legacy_fence boolean not null default false,
  sweep_enabled boolean not null default false,
  guard_secret uuid not null default gen_random_uuid(),
  -- This is a namespace/obfuscation salt, not an authentication secret.
  recording_key_namespace uuid not null default gen_random_uuid()
);
insert into public.data_deletion_safety_config(singleton) values (true);
alter table public.data_deletion_safety_config enable row level security;
revoke all on public.data_deletion_safety_config from public, anon, authenticated, service_role;
grant select on public.data_deletion_safety_config to service_role;
grant update (enforce_legacy_fence, sweep_enabled) on public.data_deletion_safety_config to service_role;

-- One global, non-cycling counter issues new-app recording IDs without keeping
-- per-learner history after deletion. Its UUIDv8 namespace begins with f;
-- the 0080 compatibility allocator uses 0 and the old app uses UUIDv4. These
-- are disjoint even when a request spans schema expansion. Neither counter may
-- be reset on deletion, restore, or ordinary maintenance. Postgres nextval
-- values are not rolled back, so failed requests consume IDs.
create sequence public.recording_key_sequence as bigint minvalue 1 maxvalue 1152921504606846975 no cycle cache 1;
revoke all on sequence public.recording_key_sequence from public, anon, authenticated, service_role;
create function public.allocate_recording_key() returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_namespace text; v_counter bigint; v_mask bigint; v_encoded text;
begin
  select replace(recording_key_namespace::text, '-', '') into strict v_namespace
    from public.data_deletion_safety_config where singleton;
  v_counter := nextval('public.recording_key_sequence'::regclass);
  -- XOR with a fixed 60-bit salt is a bijection: it obscures the counter but
  -- never introduces collisions. It is not an authorization mechanism.
  v_mask := (('x' || substr(v_namespace, 16, 15))::bit(60))::bigint;
  v_encoded := lpad(to_hex(v_counter # v_mask), 15, '0');
  return ('f' || substr(v_namespace, 2, 7) || '-' || substr(v_namespace, 9, 4) || '-8' ||
    substr(v_namespace, 13, 3) || '-8' || substr(v_encoded, 1, 3) || '-' || substr(v_encoded, 4, 12))::uuid;
end $$;
revoke all on function public.allocate_recording_key() from public, anon, authenticated;
grant execute on function public.allocate_recording_key() to service_role;

create function public.protect_data_deletion_profile_marker()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if current_user in ('authenticated', 'anon') and (
    (tg_op = 'INSERT' and new.data_deletion_completed_at is not null)
    or (tg_op = 'UPDATE' and (new.data_deletion_generation is distinct from old.data_deletion_generation
      or new.data_deletion_completed_at is distinct from old.data_deletion_completed_at))
  ) then raise exception 'Deletion security markers cannot be changed directly' using errcode = '42501'; end if;
  return new;
end $$;
create trigger protect_data_deletion_profile_marker before insert or update on public.profiles
  for each row execute function public.protect_data_deletion_profile_marker();

create function public.promote_retryable_data_deletion(p_user_id uuid, p_lock_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_user_id is null or p_lock_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  update public.week_speaking_deletion_locks set expires_at = '9999-12-31 23:59:59+00'::timestamptz, retry_claim = null
    where user_id = p_user_id and lock_id = p_lock_id
      and expires_at > clock_timestamp() and expires_at < '6000-01-01 00:00:00+00'::timestamptz;
  return found;
end $$;

create function public.claim_retryable_data_deletion(p_user_id uuid, p_lock_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_expiry timestamptz; v_now timestamptz; v_claim uuid := gen_random_uuid();
begin
  if p_user_id is null or p_lock_id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  v_now := clock_timestamp();
  select expires_at into v_expiry from public.week_speaking_deletion_locks
    where user_id = p_user_id and lock_id = p_lock_id for update;
  if not found or v_expiry < '6000-01-01 00:00:00+00'::timestamptz then return null; end if;
  if v_expiry <> '9999-12-31 23:59:59+00'::timestamptz
     and v_expiry - interval '4800 years' > v_now then return null; end if;
  update public.week_speaking_deletion_locks
    set expires_at = v_now + interval '4800 years 30 minutes', retry_claim = v_claim
    where user_id = p_user_id and lock_id = p_lock_id returning expires_at into v_expiry;
  return jsonb_build_object('token', v_claim, 'expiry', v_expiry::text);
end $$;

create function public.release_retryable_data_deletion(p_user_id uuid, p_lock_id uuid, p_claim_until timestamptz, p_claim_token uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_user_id is null or p_lock_id is null or p_claim_until is null or p_claim_token is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  update public.week_speaking_deletion_locks set expires_at = '9999-12-31 23:59:59+00'::timestamptz, retry_claim = null
    where user_id = p_user_id and lock_id = p_lock_id and expires_at = p_claim_until and retry_claim = p_claim_token
      and expires_at >= '6000-01-01 00:00:00+00'::timestamptz
      and expires_at <> '9999-12-31 23:59:59+00'::timestamptz;
  return found;
end $$;

-- Serialize owner writes with promotion and final deletion. The finalizer sets
-- a separate service-only secret within its transaction; the job id appears in
-- the user's receipt and must not itself authorize this bypass. Legacy finite
-- locks retain their 0080 behavior during the compatibility period.
create function public.guard_pending_data_deletion_row()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  old_owner uuid; new_owner uuid; v_owner uuid; v_lock uuid; v_generation uuid; v_finished timestamptz;
  v_enforce boolean; v_secret text; v_bypass boolean;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_actor text := lower(coalesce(v_headers->>'x-fluency-data-owner', ''));
  v_epoch text := lower(coalesce(v_headers->>'x-fluency-data-generation', ''));
  v_target_epoch text := lower(coalesce(v_headers->>'x-fluency-target-generation', ''));
begin
  -- Grouped issue alerts update existing reports for several owners, often
  -- from one learner's request. Only these service-only bookkeeping fields
  -- may bypass the barrier; no report can be inserted or its contents changed.
  -- Do not take an owner advisory lock for this update: alert functions lock
  -- the page/report first, and deletion locks the owner first. The row locks
  -- still serialize the metadata update with deletion of that existing report.
  if auth.role() = 'service_role' and tg_table_name = 'issue_reports' and tg_op = 'UPDATE'
     and (to_jsonb(new) - array['email_sent_at','email_grouped','email_page_hash'])
       = (to_jsonb(old) - array['email_sent_at','email_grouped','email_page_hash']) then
    return new;
  end if;
  -- Existing trusted background jobs are not learner requests. Retention only
  -- removes expired data or clears an audio reference; billing updates only
  -- change retained subscription fields. Let those operations continue even
  -- during a pending job, without allowing them to write new learning data.
  if auth.role() = 'service_role' and v_actor = '' then
    if tg_op = 'DELETE' and tg_table_name in ('ai_evaluation_cache', 'ai_request_logs', 'ai_usage_events') then
      return old;
    end if;
    if tg_op = 'UPDATE' and tg_table_name = 'profiles'
       and (to_jsonb(new) - array['stripe_customer_id','stripe_subscription_id','subscription_status','current_period_end','updated_at'])
         = (to_jsonb(old) - array['stripe_customer_id','stripe_subscription_id','subscription_status','current_period_end','updated_at']) then
      return new;
    end if;
    if tg_op = 'UPDATE' and tg_table_name = 'speaking_attempts' and to_jsonb(new)->>'audio_path' is null
       and (to_jsonb(new) - array['audio_path','updated_at']) = (to_jsonb(old) - array['audio_path','updated_at']) then
      return new;
    end if;
  end if;
  select enforce_legacy_fence, guard_secret::text into v_enforce, v_secret
    from public.data_deletion_safety_config where singleton;
  v_bypass := coalesce(current_setting('fluency.data_deletion_token', true), '') = coalesce(v_secret, '<missing>');
  if tg_op <> 'INSERT' then old_owner := nullif(to_jsonb(old)->>tg_argv[0], '')::uuid; end if;
  if tg_op <> 'DELETE' then new_owner := nullif(to_jsonb(new)->>tg_argv[0], '')::uuid; end if;
  for v_owner in select distinct x from unnest(array[old_owner, new_owner]) as owners(x)
    where x is not null order by x loop
    perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
    select lock_id into v_lock from public.week_speaking_deletion_locks
      where user_id = v_owner and expires_at >= '6000-01-01 00:00:00+00'::timestamptz;
    if found and not v_bypass then
      raise exception 'Data deletion is pending; finish it before saving new work' using errcode = 'P0001';
    end if;
    -- After the fleet has converged, also reject a request which started
    -- before the completed deletion but reached this table afterwards. The
    -- authenticated browser or verified server proxy pins its start epoch in
    -- request.headers. Background service jobs have no learner actor and keep
    -- their existing behavior; service_role is itself a trusted credential.
    if coalesce(v_enforce, false) and not v_bypass then
      select data_deletion_generation, data_deletion_completed_at into v_generation, v_finished
        from public.profiles where id = v_owner;
      if v_finished is not null then
        -- A teacher can assign pilot access to another owner. Unlike a
        -- review/status update (which only changes an existing UUID-keyed
        -- row), that RPC can insert a row after deletion. Pin the *target's*
        -- generation from the roster, not the signed-in teacher's generation.
        if tg_table_name = 'pilot_learners'
           and ((auth.uid() is not null and auth.uid() <> v_owner)
             or v_actor not in ('', 'unverified', v_owner::text)) then
          if v_target_epoch <> v_generation::text then
            raise exception 'This learner changed after data deletion; refresh the roster' using errcode = 'P0001';
          end if;
        elsif (auth.uid() = v_owner or v_actor = v_owner::text or v_actor = 'unverified')
           and v_epoch <> v_generation::text then
          raise exception 'This request began before data deletion; refresh and try again' using errcode = 'P0001';
        end if;
      end if;
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t record;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb using (table_schema, table_name)
    where c.table_schema = 'public' and c.column_name = 'user_id' and tb.table_type = 'BASE TABLE'
      and c.table_name not in ('subscriptions', 'week_speaking_deletion_locks')
    order by c.table_name
  loop
    execute format('create trigger guard_pending_data_deletion before insert or update or delete on public.%I for each row execute function public.guard_pending_data_deletion_row(''user_id'')', t.table_name);
  end loop;
end $$;
create trigger guard_pending_data_deletion before insert or update or delete on public.profiles
  for each row execute function public.guard_pending_data_deletion_row('id');

-- The teacher roster already exposes these learners to staff. Return only
-- opaque generations so a pilot-access action is pinned before roster data is
-- loaded. No learner may enumerate other users' generations.
create function public.teacher_get_data_deletion_generations()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Teacher access required' using errcode = '42501';
  end if;
  return coalesce((select jsonb_object_agg(p.id::text, p.data_deletion_generation::text)
    from public.profiles p where p.role = 'learner'), '{}'::jsonb);
end $$;
revoke all on function public.teacher_get_data_deletion_generations() from public, anon;
grant execute on function public.teacher_get_data_deletion_generations() to authenticated;

-- Preserve the old cache RPC signatures for old app instances. Scope cache
-- keys by owner and use the same deletion barrier as learner-owned rows. A
-- pre-migration invocation of the old setter that reaches its INSERT after
-- this migration is also scoped by the trigger rather than creating a new
-- ownerless entry. It is harmless if such an old reader simply misses.
create function public.scope_ai_evaluation_cache()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' and new.cache_owner_id is null then
    if auth.uid() is null then raise exception 'Cache owner required' using errcode = '42501'; end if;
    new.cache_owner_id := auth.uid();
    new.cache_key := new.cache_owner_id::text || ':' || new.cache_key;
  elsif tg_op = 'UPDATE' and (new.cache_owner_id is distinct from old.cache_owner_id
      or new.cache_key is distinct from old.cache_key) then
    raise exception 'Cache ownership cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
-- PostgreSQL fires same-kind triggers in name order: scope first, then guard.
create trigger a_scope_ai_evaluation_cache before insert or update on public.ai_evaluation_cache
  for each row execute function public.scope_ai_evaluation_cache();
create trigger guard_pending_data_deletion before insert or update or delete on public.ai_evaluation_cache
  for each row execute function public.guard_pending_data_deletion_row('cache_owner_id');

-- Some replayed databases have an old opportunistic, cross-owner expiry purge
-- inside delete_my_learning_data(). Production's inspected 0080 definition
-- does not. On the replay shape, remove only that exact known statement: the
-- retention cron still expires old cache rows, and our wrapper removes this
-- owner's cache atomically. Otherwise a deletion can lock or be blocked by a
-- different owner's pending job. Fail rather than rewriting an unknown body.
do $$
declare
  definition text;
  remaining text;
  removed_length integer;
  old_expiry constant text := E'delete from public.ai_evaluation_cache\n   where last_hit_at < now() - interval ''90 days'';';
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  remaining := replace(definition, old_expiry, '');
  removed_length := length(definition) - length(remaining);
  -- Check the entire remaining body, not just the number of known clauses.
  -- Match the table name case-insensitively even when it is unqualified or
  -- quoted. A comment is enough to abort: review unknown shapes manually.
  if removed_length not in (0, length(old_expiry))
     or position('ai_evaluation_cache' in lower(remaining)) > 0 then
    raise exception 'Unexpected cache deletion in delete_my_learning_data; review the live definition';
  end if;
  if removed_length = length(old_expiry) then
    execute replace(definition, old_expiry, '-- Expired cache is handled by the retention job.');
  end if;
end $$;

create or replace function public.get_ai_eval_cache(p_cache_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_owner uuid := auth.uid(); v_response jsonb;
begin
  if v_owner is null then return null; end if;
  update public.ai_evaluation_cache set hit_count = hit_count + 1, last_hit_at = now()
    where cache_owner_id = v_owner and cache_key = v_owner::text || ':' || p_cache_key
      and created_at > now() - interval '30 days'
    returning response into v_response;
  return v_response;
end $$;

create or replace function public.set_ai_eval_cache(p_cache_key text, p_endpoint text, p_model text, p_response jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then return; end if;
  insert into public.ai_evaluation_cache(cache_key, cache_owner_id, endpoint, model, response)
    values (v_owner::text || ':' || p_cache_key, v_owner, p_endpoint, p_model, p_response)
    on conflict (cache_key) do update
      set response = excluded.response, model = excluded.model, last_hit_at = now()
      where public.ai_evaluation_cache.cache_owner_id = v_owner;
end $$;

-- A new app on an old schema treats the absent owned-cache RPCs as a cache
-- miss/no-op instead of adding more entries to the old ownerless cache. The
-- old app still calls the compatible four-argument signatures above.
create function public.get_owned_ai_eval_cache(p_cache_key text)
returns jsonb language sql set search_path = pg_catalog, public as $$
  select public.get_ai_eval_cache(p_cache_key)
$$;
create function public.set_owned_ai_eval_cache(p_cache_key text, p_endpoint text, p_model text, p_response jsonb)
returns void language sql set search_path = pg_catalog, public as $$
  select public.set_ai_eval_cache(p_cache_key, p_endpoint, p_model, p_response)
$$;
revoke all on function public.scope_ai_evaluation_cache() from public, anon, authenticated;
revoke all on function public.get_owned_ai_eval_cache(text) from public, anon;
revoke all on function public.set_owned_ai_eval_cache(text,text,text,jsonb) from public, anon;
grant execute on function public.get_owned_ai_eval_cache(text) to authenticated, service_role;
grant execute on function public.set_owned_ai_eval_cache(text,text,text,jsonb) to authenticated, service_role;

-- New report requests carry the generation read when the request began, even
-- for text-only reports. An earlier request may not write after deletion has
-- rotated the generation. Old reports without the column remain compatible
-- until the explicitly activated post-rollout fence.
create function public.guard_issue_deletion_generation()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_generation uuid; v_finished timestamptz; v_enforce boolean; v_prefix text;
begin
  -- The same narrow exemption as the owner barrier above: alert grouping only
  -- annotates an existing row, including legacy rows, and must not acquire an
  -- owner lock after it has already locked the report.
  if auth.role() = 'service_role' and tg_op = 'UPDATE'
     and (to_jsonb(new) - array['email_sent_at','email_grouped','email_page_hash'])
       = (to_jsonb(old) - array['email_sent_at','email_grouped','email_page_hash']) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select data_deletion_generation, data_deletion_completed_at into v_generation, v_finished
    from public.profiles where id = new.user_id;
  select enforce_legacy_fence into v_enforce from public.data_deletion_safety_config where singleton;
  if new.data_deletion_generation is not null then
    if new.data_deletion_generation is distinct from v_generation then
      raise exception 'This report began before data deletion; please send it again' using errcode = 'P0001';
    end if;
    v_prefix := new.user_id::text || '/deletion-v1/' || v_generation::text || '/';
    if (new.audio_path is not null and left(new.audio_path, length(v_prefix)) <> v_prefix)
       or (new.screenshot_path is not null and left(new.screenshot_path, length(v_prefix)) <> v_prefix) then
      raise exception 'Invalid report attachment generation' using errcode = 'P0001';
    end if;
  elsif coalesce(v_enforce, false) and (tg_op = 'INSERT' or v_finished is not null) then
    -- Once old clients retire, reject new untagged reports for every account.
    -- Staff can still update an existing legacy report for an account that has
    -- not deleted data; these older rows have no generation to supply.
    raise exception 'Refresh the app before sending a report' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_issue_deletion_generation before insert or update on public.issue_reports
  for each row execute function public.guard_issue_deletion_generation();

-- Storage checks run both for the initial authorization and the final metadata
-- write. Generation-tagged report paths are fenced even after a job completes.
-- Once legacy instances retire, the separate flag rejects old untagged
-- uploads for every account, including those that have never deleted data.
-- Deletes remain the Storage API's responsibility; this trigger never
-- removes metadata or bytes.
create function public.guard_pending_data_deletion_storage()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare old_owner uuid; new_owner uuid; v_owner uuid; v_lock uuid;
  v_generation uuid; v_finished timestamptz; v_enforce boolean;
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if tg_op = 'UPDATE' and old.bucket_id in ('speaking-recordings', 'issue-attachments')
     and position('/' in old.name) > 0 and split_part(old.name, '/', 1) ~* v_uuid then
    old_owner := split_part(old.name, '/', 1)::uuid;
  end if;
  if new.bucket_id in ('speaking-recordings', 'issue-attachments')
     and position('/' in new.name) > 0 and split_part(new.name, '/', 1) ~* v_uuid then
    new_owner := split_part(new.name, '/', 1)::uuid;
  end if;
  for v_owner in select distinct x from unnest(array[old_owner, new_owner]) as owners(x)
    where x is not null order by x loop
    perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
    select lock_id into v_lock from public.week_speaking_deletion_locks
      where user_id = v_owner and expires_at >= '6000-01-01 00:00:00+00'::timestamptz;
    if found then
      raise exception 'Data deletion is pending; this upload cannot be saved' using errcode = 'P0001';
    end if;
  end loop;
  select enforce_legacy_fence into v_enforce from public.data_deletion_safety_config where singleton;
  if coalesce(v_enforce, false) and (
      new.bucket_id in ('speaking-recordings', 'issue-attachments')
      or (tg_op = 'UPDATE' and old.bucket_id in ('speaking-recordings', 'issue-attachments'))
    ) then
    -- The supported application writes both buckets through its server. A
    -- browser must not bypass the contract by copying current metadata onto a
    -- direct upload, even when it guesses an active recording reservation.
    if auth.role() is distinct from 'service_role' then
      raise exception 'Direct learner uploads are no longer supported; refresh the app' using errcode = 'P0001';
    end if;
    if new.bucket_id in ('speaking-recordings', 'issue-attachments') and new_owner is null then
      raise exception 'An owned storage key is required' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and (old.bucket_id is distinct from new.bucket_id or old.name is distinct from new.name) then
      raise exception 'Protected storage keys cannot be moved' using errcode = 'P0001';
    end if;
    -- A previously signed upload URL can execute as Storage's service role.
    -- Accept only the ordinary server POST endpoint used by this app; signed,
    -- resumable and S3 upload paths are not supported after the contract step.
    -- Fail closed if Storage does not supply its trusted request context.
    if new.bucket_id in ('speaking-recordings', 'issue-attachments') and (
        coalesce(current_setting('request.method', true), '') <> 'POST'
        or not (
          coalesce(current_setting('request.path', true), '') like '/object/' || new.bucket_id || '/%'
          or coalesce(current_setting('request.path', true), '') like '/storage/v1/object/' || new.bucket_id || '/%'
        )
      ) then
      raise exception 'Only current server uploads are supported; refresh the app' using errcode = 'P0001';
    end if;
  end if;
  if new_owner is null then return new; end if;
  select data_deletion_generation, data_deletion_completed_at into v_generation, v_finished
    from public.profiles where id = new_owner;
  if tg_op = 'UPDATE' and (old.bucket_id is distinct from new.bucket_id or old.name is distinct from new.name)
     and (split_part(old.name, '/', 2) = 'deletion-v1' or split_part(new.name, '/', 2) = 'deletion-v1') then
    raise exception 'Protected storage keys cannot be moved' using errcode = 'P0001';
  end if;
  if new.bucket_id = 'issue-attachments' and split_part(new.name, '/', 2) = 'deletion-v1' then
    if v_generation is null or split_part(new.name, '/', 3) !~* v_uuid or split_part(new.name, '/', 4) = ''
       or lower(split_part(new.name, '/', 3)) <> v_generation::text then
      raise exception 'This upload began before data deletion; please send it again' using errcode = 'P0001';
    end if;
  elsif new.bucket_id = 'speaking-recordings' and new.user_metadata ? 'data_deletion_generation' then
    if v_generation is null or coalesce(lower(new.user_metadata->>'data_deletion_generation'), '') <> v_generation::text then
      raise exception 'This upload began before data deletion; please record it again' using errcode = 'P0001';
    end if;
    -- A delayed Storage removal is key-based. After a deletion, do not let a
    -- current-generation upload reuse an arbitrary legacy key the worker may
    -- already have snapshotted. Supported new uploads reserve a fresh
    -- weekly-take key before writing metadata, even with the legacy fence off.
    if v_finished is not null and not exists (
      select 1 from public.week_speaking_takes t join public.week_speaking_flows f
        on f.user_id = t.user_id and f.week_number = t.week_number and f.active_upload_id = t.id
      where t.user_id = new_owner and t.recording_path = new.name and t.status = 'uploading'
        and f.active_since >= clock_timestamp() - interval '30 minutes'
    ) then raise exception 'A fresh recording key must be reserved' using errcode = 'P0001'; end if;
  end if;
  -- This contract gate applies to every learner, not only those with an
  -- existing deletion marker. Otherwise an obsolete browser could keep
  -- uploading for accounts that have never deleted data after the pilot starts.
  if coalesce(v_enforce, false) then
    -- The new server labels the request according to the browser's explicit
    -- start epoch. This check occurs in Storage's final write too: an old tab
    -- whose request started just before activation cannot slip through later.
    if coalesce(new.user_metadata->>'data_deletion_client', '') <> 'v1' then
      raise exception 'This legacy upload is no longer supported; refresh the app' using errcode = 'P0001';
    end if;
    if new.bucket_id = 'issue-attachments' and split_part(new.name, '/', 2) <> 'deletion-v1' then
      raise exception 'This legacy upload is no longer supported; refresh the app' using errcode = 'P0001';
    elsif new.bucket_id = 'speaking-recordings' and (
      v_generation is null or coalesce(lower(new.user_metadata->>'data_deletion_generation'), '') <> v_generation::text or not exists (
        select 1 from public.week_speaking_takes t join public.week_speaking_flows f
          on f.user_id = t.user_id and f.week_number = t.week_number and f.active_upload_id = t.id
        where t.user_id = new_owner and t.recording_path = new.name and t.status = 'uploading'
          and f.active_since >= clock_timestamp() - interval '30 minutes'
      )
    ) then raise exception 'This legacy upload is no longer supported; refresh the app' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
create trigger guard_pending_data_deletion_storage before insert or update on storage.objects
  for each row execute function public.guard_pending_data_deletion_storage();

-- Keep the 0080 wrapper and signature for old applications. Record the
-- completed deletion and rotate the upload generation in the SAME transaction
-- as the existing deletion RPC, including for successful old-app deletions.
-- A durable job may only be finished through the fenced worker RPC below.
create or replace function public.finish_week_speaking_deletion(p_user_id uuid, p_lock_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_expires timestamptz; result jsonb;
begin
  if p_user_id is null or p_lock_id is null then raise exception 'Invalid deletion request' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select expires_at into v_expires from public.week_speaking_deletion_locks
    where user_id = p_user_id and lock_id = p_lock_id and expires_at > clock_timestamp();
  if not found then raise exception 'Deletion lease expired; please try again' using errcode = 'P0001'; end if;
  if v_expires >= '6000-01-01 00:00:00+00'::timestamptz
     and coalesce(current_setting('fluency.data_deletion_token', true), '') <>
       coalesce((select guard_secret::text from public.data_deletion_safety_config where singleton), '<missing>') then
    raise exception 'This pending deletion needs its retry worker' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.week_speaking_flows where user_id = p_user_id and (active_upload_id is not null or active_check_id is not null)) then
    raise exception 'A weekly speaking recording is in progress' using errcode = 'P0001';
  end if;
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  result := public.delete_my_learning_data();
  if result->>'deleted' <> 'true' then raise exception 'Data deletion did not complete' using errcode = 'P0001'; end if;
  -- The scoped cache is not a user_id table, so the older generic deletion
  -- verifier cannot discover it. Delete it in this same owner-locked commit.
  delete from public.ai_evaluation_cache where cache_owner_id = p_user_id;
  update public.profiles set data_deletion_generation = gen_random_uuid(), data_deletion_completed_at = clock_timestamp()
    where id = p_user_id;
  if not found then raise exception 'Deletion security marker could not be recorded' using errcode = 'P0001'; end if;
  return result;
end $$;

-- Metadata listing and the final check use identical owner/bucket criteria.
-- Objects are always removed through the Storage API, never with SQL DELETE.
create function public.list_retryable_deletion_files(
  p_user_id uuid, p_lock_id uuid, p_claim_until timestamptz, p_claim_token uuid,
  p_after_bucket text default '', p_after_name text default ''
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if not exists (select 1 from public.week_speaking_deletion_locks
    where user_id = p_user_id and lock_id = p_lock_id and expires_at = p_claim_until and retry_claim = p_claim_token
      and expires_at >= '6000-01-01 00:00:00+00'::timestamptz
      and expires_at <> '9999-12-31 23:59:59+00'::timestamptz
      and expires_at - interval '4800 years' > clock_timestamp()) then
    raise exception 'Deletion worker expired; please retry' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('bucket', q.bucket_id, 'path', q.name)
      order by q.bucket_id collate "C", q.name collate "C"), '[]'::jsonb)
    into result from (select bucket_id, name from storage.objects
      where bucket_id in ('speaking-recordings', 'issue-attachments')
        and lower(split_part(name, '/', 1)) = p_user_id::text and position('/' in name) > 0
        and (bucket_id collate "C", name collate "C") >
            (coalesce(p_after_bucket, '') collate "C", coalesce(p_after_name, '') collate "C")
      order by bucket_id collate "C", name collate "C" limit 100) q;
  return result;
end $$;

create function public.finish_retryable_data_deletion(p_user_id uuid, p_lock_id uuid, p_claim_until timestamptz, p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_user_id is null or p_lock_id is null or p_claim_until is null or p_claim_token is null then
    raise exception 'Invalid deletion request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if not exists (select 1 from public.week_speaking_deletion_locks
    where user_id = p_user_id and lock_id = p_lock_id and expires_at = p_claim_until and retry_claim = p_claim_token
      and expires_at >= '6000-01-01 00:00:00+00'::timestamptz
      and expires_at <> '9999-12-31 23:59:59+00'::timestamptz
      and expires_at - interval '4800 years' > clock_timestamp()) then
    raise exception 'Deletion worker expired; please retry' using errcode = 'P0001';
  end if;
  if exists (select 1 from storage.objects where bucket_id in ('speaking-recordings', 'issue-attachments')
      and lower(split_part(name, '/', 1)) = p_user_id::text and position('/' in name) > 0) then
    raise exception 'Some stored files are still present; please retry' using errcode = 'P0001';
  end if;
  perform set_config('fluency.data_deletion_token', (select guard_secret::text from public.data_deletion_safety_config where singleton), true);
  return public.finish_week_speaking_deletion(p_user_id, p_lock_id);
end $$;

-- Daily safety-net candidates: keep any current-generation report or recording,
-- even if its ledger row is missing, plus any current weekly take in progress.
-- Other owned files after a completed deletion are legacy/stale. The owner is never logged. A
-- legacy client still writing after deletion cannot identify new work; that is
-- the explicit temporary overlap risk until the fence is enabled.
create function public.list_late_deletion_files(p_after_bucket text default '', p_after_name text default '', p_limit integer default 100, p_user_id uuid default null)
returns table(bucket_id text, object_name text) language sql stable security definer set search_path = pg_catalog, public as $$
  select o.bucket_id, o.name
  from storage.objects o join public.profiles p on lower(split_part(o.name, '/', 1)) = p.id::text
  where o.bucket_id in ('speaking-recordings', 'issue-attachments') and position('/' in o.name) > 0
    and p.data_deletion_completed_at is not null and (p_user_id is null or p.id = p_user_id)
    and (o.bucket_id collate "C", o.name collate "C") >
        (coalesce(p_after_bucket, '') collate "C", coalesce(p_after_name, '') collate "C")
    and not (
      (o.bucket_id = 'issue-attachments' and split_part(o.name, '/', 2) = 'deletion-v1'
        and lower(split_part(o.name, '/', 3)) = p.data_deletion_generation::text and split_part(o.name, '/', 4) <> '')
      or (o.bucket_id = 'speaking-recordings' and (
        coalesce(lower(o.user_metadata->>'data_deletion_generation') = p.data_deletion_generation::text, false)
        or exists (select 1 from public.week_speaking_takes t where t.user_id = p.id and t.recording_path = o.name
          and t.created_at >= p.data_deletion_completed_at)
      ))
    )
  order by o.bucket_id collate "C", o.name collate "C"
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

revoke all on function public.protect_data_deletion_profile_marker() from public, anon, authenticated;
revoke all on function public.promote_retryable_data_deletion(uuid,uuid) from public, anon, authenticated;
revoke all on function public.claim_retryable_data_deletion(uuid,uuid) from public, anon, authenticated;
revoke all on function public.release_retryable_data_deletion(uuid,uuid,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.guard_pending_data_deletion_row() from public, anon, authenticated;
revoke all on function public.guard_issue_deletion_generation() from public, anon, authenticated;
revoke all on function public.guard_pending_data_deletion_storage() from public, anon, authenticated;
revoke all on function public.list_retryable_deletion_files(uuid,uuid,timestamptz,uuid,text,text) from public, anon, authenticated;
revoke all on function public.finish_retryable_data_deletion(uuid,uuid,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.list_late_deletion_files(text,text,integer,uuid) from public, anon, authenticated;
grant execute on function public.promote_retryable_data_deletion(uuid,uuid) to service_role;
grant execute on function public.claim_retryable_data_deletion(uuid,uuid) to service_role;
grant execute on function public.release_retryable_data_deletion(uuid,uuid,timestamptz,uuid) to service_role;
grant execute on function public.list_retryable_deletion_files(uuid,uuid,timestamptz,uuid,text,text) to service_role;
grant execute on function public.finish_retryable_data_deletion(uuid,uuid,timestamptz,uuid) to service_role;
grant execute on function public.list_late_deletion_files(text,text,integer,uuid) to service_role;

notify pgrst, 'reload schema';
