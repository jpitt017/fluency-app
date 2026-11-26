-- Migration 0062: private weekly speaking recordings and staff playback.
--
-- Week 1–4 takes are already uploaded by /api/speaking/evaluate to
--   speaking-recordings/<auth user id>/week-speaking/<week>/<attempt>/take-<n>.<ext>
-- This migration locks the bucket to private, keeps the existing owner-only
-- policies, and adds read-only staff access for the weekly rows and objects.
-- It does not replace an existing function: the deletion RPC already collects
-- both weekly recording paths (0060) and the coverage guard already checks
-- every learner-owned table. Both are asserted below so a replay cannot drift.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'speaking-recordings',
  'speaking-recordings',
  false,
  26214400,
  array['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-m4a']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Belt and braces: an existing bucket must not stay public on an older project.
update storage.buckets set public = false where id = 'speaking-recordings';

-- Teachers and admins can inspect any learner's weekly attempt row. The existing
-- "read own week speaking attempts" policy stays in place for learners; policies
-- are additive, and no write policy is added here.
grant select on public.week_speaking_attempts to authenticated;
drop policy if exists "week speaking attempts staff read" on public.week_speaking_attempts;
create policy "week speaking attempts staff read" on public.week_speaking_attempts
  for select to authenticated
  using (public.is_staff());

-- Staff signed links are limited to the weekly folder. Other private recordings
-- in this bucket remain owner-only. The app route also validates that the first
-- path segment is the row's user id before minting a link.
drop policy if exists "week speaking recordings staff read" on storage.objects;
create policy "week speaking recordings staff read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'speaking-recordings'
    and array_length(storage.foldername(name), 1) >= 5
    and (storage.foldername(name))[2] = 'week-speaking'
    and public.is_staff()
  );

do $$
begin
  if exists (select 1 from storage.buckets where id = 'speaking-recordings' and public) then
    raise exception 'speaking-recordings must never be a public bucket';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'week_speaking_attempts'
      and policyname = 'read own week speaking attempts'
  ) then
    raise exception 'Owner-only weekly attempt policy is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'week_speaking_attempts'
      and policyname = 'week speaking attempts staff read'
  ) then
    raise exception 'Staff weekly attempt policy is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'recordings own read'
  ) then
    raise exception 'Owner-only recording policy is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'week speaking recordings staff read'
  ) then
    raise exception 'Staff weekly recording policy is missing';
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
    raise exception 'Anonymous Storage policy must not expose speaking-recordings';
  end if;
  if position('public.week_speaking_attempts' in pg_get_functiondef('public.delete_my_learning_data()'::regprocedure)) = 0
     or position('first_recording_path' in pg_get_functiondef('public.delete_my_learning_data()'::regprocedure)) = 0
     or position('second_recording_path' in pg_get_functiondef('public.delete_my_learning_data()'::regprocedure)) = 0 then
    raise exception 'Delete my data must report both weekly recording paths';
  end if;
  if not ((public.verify_delete_my_learning_data_coverage()->>'covered')::boolean) then
    raise exception 'Deletion coverage guard failed: %', public.verify_delete_my_learning_data_coverage();
  end if;
end $$;

notify pgrst, 'reload schema';
