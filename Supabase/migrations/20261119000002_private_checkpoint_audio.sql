-- Private audio storage for learner checkpoint submissions.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkpoint-recordings', 'checkpoint-recordings', false, 10485760, array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Learners can upload their own checkpoint recordings" on storage.objects;
create policy "Learners can upload their own checkpoint recordings"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'checkpoint-recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Learners can read their own checkpoint recordings" on storage.objects;
create policy "Learners can read their own checkpoint recordings"
  on storage.objects for select to authenticated
  using (bucket_id = 'checkpoint-recordings' and (storage.foldername(name))[1] = auth.uid()::text);
