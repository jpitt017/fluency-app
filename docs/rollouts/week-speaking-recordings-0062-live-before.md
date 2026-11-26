# 0062 weekly speaking recordings — live before-state

**Date:** 2026-11-26
**Live project:** `ebzmkhrssgnzmixfsuso`
**Status:** before-state inspection only. The apply was later approved by the owner; see the post-apply verification below.

## Read-only checks

- Final `list_migrations` on live showed numeric migrations through `0061`; `select version, name ... where version like '006%'` returned exactly `0060 week_speaking_support` and `0061 log_ai_request_hardening`. No `0062`–`0069` row exists. Legacy timestamp rows were left unchanged. PR #105 (migration `0059`) was open at this check and was later merged into `main`; neither it nor `main` claimed `0062`.
- Final `list_migrations` on the isolated E2E project showed `0059 week_sentence_writing_support`, `0060`, `0061` and no `0062`.
- `storage.buckets`: `speaking-recordings` has `public = false`, a 26,214,400-byte limit and the audio MIME allow-list. A read for a public bucket returned zero rows.
- `pg_policies` on `storage.objects` for this bucket has exactly the four owner-only policies (`recordings own read/write/update/delete`) and no weekly staff policy.
- `pg_policies` on `public.week_speaking_attempts` has exactly `read own week speaking attempts` (`user_id = auth.uid()`), with no staff policy.
- `delete_my_learning_data()` already mentions `public.week_speaking_attempts`, `first_recording_path` and `second_recording_path`; `verify_delete_my_learning_data_coverage()` returns `{"covered":true,"missing_tables":[]}`.
- The one existing live weekly attempt has one canonical owner-prefixed `first_recording_path`; no non-canonical saved paths were found, so the new strict parser does not orphan existing playback.

## Migration 0062

`supabase-b1-b2/migrations/0062_week_speaking_recording_access.sql`:

- forces `speaking-recordings` to remain private on conflict;
- adds an additive staff-read policy for weekly attempt rows;
- adds an additive staff-read policy on `storage.objects`, limited to the `week-speaking` folder;
- asserts the owner policies, absence of an anon policy for the bucket, and the existing deletion coverage. It does **not** replace an existing PostgreSQL function, so no live `pg_get_functiondef(...)` pre-capture is required.

`scripts/prepare-week-speaking-0062-rollout.mjs` prints the reviewed file SQL plus:

```sql
insert into supabase_migrations.schema_migrations
  (version, name, statements)
values
  ('0062', 'week_speaking_recording_access', null)
on conflict (version) do nothing;
```

Per `docs/CONTENT_PIPELINE.md` §3.1, the live apply uses one reviewed `execute_query` statement, never `supabase db push` or connector `create_migration`. Verify read-only afterwards; correcting any existing history row needs separate owner approval.

## Post-apply verification (owner approved)

- `0062 week_speaking_recording_access`, `statements = null` is the only row added by this apply; no timestamp version newer than the pre-existing `20261124212925` appeared. `0059 week_sentence_writing_support` was added concurrently by the separate PR #105 rollout and was not edited here.
- `select public.verify_app_schema()` returned `covered = true` with empty `missing_tables`, `missing_columns`, `missing_functions`, `missing_policies`, `missing_triggers` and `missing_buckets` arrays.
- `storage.buckets`: `speaking-recordings` is private; `course-audio` remains public and `course-audio-review` remains private. The bucket upsert and `update` in 0062 name `speaking-recordings` only.
- `pg_policies`: `week speaking attempts staff read` and `week speaking recordings staff read` are both `SELECT`, `roles = {authenticated}`, `with_check = null`, and use `public.is_staff()`. The live `public.is_staff()` definition checks `profiles.role in ('teacher', 'admin')` for `auth.uid()`.
- `verify_delete_my_learning_data_coverage()` returns `{"covered":true,"missing_tables":[]}`. No learner data, audio release flag or existing history row was changed by this apply.
