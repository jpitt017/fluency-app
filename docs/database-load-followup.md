# Database-load follow-up

This PR applies application-side reductions only. It adds no SQL migration and does not issue database writes during investigation.

## Changes

- `refresh_current_week()` now runs from a browser-mounted visit effect on the week, dashboard, review, and labs pages, once per mounted visit. Server Components may render during `_rsc` prefetches, but those do not mount the effect. Task POST routes now read the already-computed `profiles.current_week` and no longer lock/recompute progress on every answer, completion, or output submission. Placement completion still refreshes after the learner submits the placement result.
- The server cache uses a one-hour TTL and includes the week argument in each cache key for `syllabus_week_details_safe`, `syllabus_input_items_safe`, and `syllabus_weeks`. It uses the service-role client only from a server-only module. The detail cache is an explicit allowlist of learner-facing title, prompt, cue-card and shadowing fields; it excludes model answers and grammar practice. Input rows are projected to `{ id, question, options }`; syllabus-week JSON fields are projected to their learner-facing schema. The existing safe views remain the only source for detailed/input cache entries. Request-scoped signed-in reads remain as an uncached fallback when the service key is not configured.
- Account deletion no longer lists Storage prefixes. It reads the exact issue-report and recording object paths from the authenticated user's rows, validates that every key stays under that user's Storage prefix, then removes those exact objects before deleting the rows. Both `speaking_attempts.audio_path` and the first/second paths in `week_speaking_attempts` are covered by existing deletion code/migration 0060. The current runtime code had two `.list()` calls; these produced calls to the Storage `search` function. The separate `clearUserStorage` helper remains unused by app routes.
- Dashboard AI quota status is no longer queried while rendering the dashboard. It is fetched from a private, no-store route only after the learner opens the AI-practice disclosure. AI endpoints still enforce quotas when a learner actually requests AI work.

## Read-only production findings

Project queried: production ref `ebzmkhrssgnzmixfsuso`. These queries were `SELECT`, `EXPLAIN`, and `EXPLAIN ANALYZE` only; no DDL/DML or migration was run.

### `syllabus_week_details_safe`

- `pg_stat_statements` reported two PostgREST statement shapes with **3,506 calls** (mean **78.474 ms**, min **26.851 ms**, max **2,469.486 ms**) and **1,652 calls** (mean **137.454 ms**, min **27.115 ms**, max **3,606.060 ms**).
- The safe view is a projection over `syllabus_week_details` that calls `strip_answer_fields(payload)`. That SQL function recursively removes `key`, `accepted`, `reason`, `model`, `modelAnswer`, and `answer_index`.
- `EXPLAIN` for one week used `Index Scan using syllabus_week_details_pkey`, with `week_number = 1` as the index condition and estimated cost `0.15..2.62`; there were no joins or sequential scans.
- The read-only `EXPLAIN ANALYZE` sample reported 117 shared-buffer hits, 22.600 ms planning time, and 38.363 ms execution time. This is a single sample and not a stable benchmark.
- The fastest observed PostgREST statement at about 27 ms is therefore not evidence of a missing index: the plan already uses the week primary-key index. The query still evaluates recursive JSONB answer-field stripping, and PostgREST wraps the view read with response aggregation/settings; planning, API/JWT setup, serialization, and network overhead also contribute. The simple plan's estimated cost is not wall-clock latency. The requested caching/projection reduces repeat reads without changing database objects.

### `storage.search`

- `pg_stat_statements` reported **2,963 calls**, mean **61.866 ms**, min **0.177 ms**, max **2,704.058 ms** for the Storage search statement.
- `pg_stat_statements` aggregates calls by normalized SQL and does not retain the bucket, prefix, or HTTP caller, so it cannot prove which bucket generated every call. In the current application source, the active Storage listings were the two prefix scans in account deletion; both have been replaced by row-recorded object keys. Other app audio URLs are already constructed from known paths or stored URLs rather than discovered by listing a bucket.
- The production count is a pre-change baseline. It must be checked again after deployment to quantify the live reduction; no production cleanup or post-change write test was run.

### `log_ai_request` permissions and callers

The live function is `SECURITY DEFINER` and inserts into `ai_request_logs` using `auth.uid()`. `pg_proc` ACL inspection showed explicit `EXECUTE` for **`anon`, `authenticated`, `service_role`, and `postgres`**; therefore `anon` can execute it.

The application wrapper is `lib/b1b2/observability.ts`. Its callers are:

- `src/app/api/issues/route.ts`
- `src/app/api/writing/correct/route.ts`
- `src/app/api/week/sentence/route.ts`
- `src/app/api/speaking/evaluate/route.ts`
- `src/app/api/speaking/chat/route.ts`
- `src/app/api/review/check-rewrite/route.ts`
- `src/app/api/mediation/feedback/route.ts`
- `src/app/api/speaking/transcribe/route.ts`

**Proposed only; not applied:** revoke execute from `PUBLIC`, `anon`, and `authenticated`, then grant it to `service_role` on the exact function signature:

```sql
revoke all on function public.log_ai_request(text, text, smallint, integer, boolean, integer, integer, integer, integer, numeric, text)
  from public, anon, authenticated;
grant execute on function public.log_ai_request(text, text, smallint, integer, boolean, integer, integer, integer, integer, numeric, text)
  to service_role;
```

This permission change must not be applied alone: current callers pass user-scoped authenticated clients, and `auth.uid()` supplies the logged user. Limiting execution to `service_role` requires a coordinated trusted-server caller change that preserves validated user attribution. No migration has been created or applied; approval is still required.

## Validation

- `npm run lint`
- production build with placeholder Supabase public environment values
- targeted unit coverage for cache projections/no answer keys, storage-key deletion boundaries, refresh call placement, AI-usage lazy loading, and the affected week routes
- CI still needs to run on the new PR before merge. The no-live-mutation CI model remains unchanged.
