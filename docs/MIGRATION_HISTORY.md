# Migration history format (live vs repo)

**Status:** historical read-only audit plus the prospective convention below. The observations record read-only checks performed on 2026-11-24; no migration files, live schema, or `supabase_migrations.schema_migrations` rows were changed by that audit. The convention applies only to new migrations and does not authorize rewriting existing history.

## Scope checked (read-only)

- Repo migrations: `supabase-b1-b2/migrations/0038_*` through `0048_*` (and surrounding files for context).
- Live project: `ebzmkhrssgnzmixfsuso` (English Fluency B1-B2, active). Read-only checks used:
  - `supabase_migrations.schema_migrations` (`version`, `name`, `statements`, `created_by`, `idempotency_key`, `rollback`) via the Supabase connector `execute_query`.
  - `information_schema.columns` for `supabase_migrations.schema_migrations`.
- Git history / PR context: PR #73 body describes the 0038/0039/0040/0041 renumbering performed during that work.

## Observed live history

Live `supabase_migrations.schema_migrations` contains 44 rows total. The rows relevant to the 0038–0048 window are:

| Live version | Live name | Repo file | Format | Live `statements` | Notes |
|---|---|---:|---|---|---|
| `20261122185247` | `listening_audio_trials` | `0038_listening_audio_trials.sql` | timestamp | present | Same purpose/name family; content differs (see below). |
| `20261122185507` | `extend_schema_guard_listening_audio_trials` | `0039_listening_review_bucket.sql` | timestamp | present | **Not a clean name/content match.** Repo 0039 creates the private `course-audio-review` bucket and rewrites `verify_app_schema()` to include it; live 20261122185507 re-applies the 0026 schema guard and does not add `course-audio-review`. |
| `0040` | `vocabulary_attempts` | `0040_vocabulary_attempts.sql` | numeric | present | Name matches repo. |
| `0041` | `deletion_covers_week_practice` | `0041_deletion_covers_week_practice.sql` | numeric | present | **Content differs from repo** (see below). |
| `0042` | `week_grammar_attempts` | `0042_week_grammar_attempts.sql` | numeric | `null` | Name matches repo; live row has no stored SQL statements. |
| `0043` | `week_input_answers` | `0043_week_input_answers.sql` | numeric | `null` | Name matches repo; live row has no stored SQL statements. |
| `0044` | `repair_deletion_function` | `0044_repair_deletion_function.sql` | numeric | `null` | Name matches repo; live row has no stored SQL statements. |
| `0045` | `ai_failure_alerts` | `0045_ai_failure_alerts.sql` | numeric | `null` | Name matches repo; live row has no stored SQL statements. |
| `0046` | `week_input_gloss_answers` | `0046_week_input_gloss_answers.sql` | numeric | `null` | Name matches repo; live row has no stored SQL statements. Outside the 0040–0045 range named in the request, but same numeric/null-statements pattern. |
| `20261122190000` | `daily_review_cap` | `0047_daily_review_cap.sql` | timestamp | `null` | Name matches repo; version format differs. |
| `20261122190100` | `week_vocab_deck` | `0048_week_vocab_deck.sql` | timestamp | `null` | Name matches repo; version format differs. |

## Key discrepancies

### 1. Mixed version formats

The affected window mixes two formats:

- **Timestamp versions**: `20261122185247`, `20261122185507`, `20261122190000`, `20261122190100`.
- **Numeric versions**: `0040`–`0046`.

Repo files in this range are all numeric (`0038`–`0048`). Live history therefore cannot be mapped to repo filenames by version alone for 0038/0039/0047/0048.

### 2. 0041 content differs from repo

Repo `0041_deletion_covers_week_practice.sql` is an additive/surgical migration: it reads `pg_get_functiondef('public.delete_my_learning_data()'::regprocedure)`, inserts missing delete branches for `week_vocabulary_attempts` and `week_grammar_attempts` if absent, executes the modified definition, then replaces `verify_delete_my_learning_data_coverage()`.

Live `0041` (`deletion_covers_week_practice`) stores a full `CREATE OR REPLACE FUNCTION public.delete_my_learning_data()` replacement plus a full `CREATE OR REPLACE FUNCTION public.verify_delete_my_learning_data_coverage()` replacement. The live body includes the wider reset shape (`xp_total`, `current_week = 1`, `learner_band`, `target_band`, `longest_streak`, `last_active_on`, `daily_word_goal`, `timezone`) and guarded/explicit deletes that do not match the surgical repo file.

Impact: a fresh replay from repo migrations does not reproduce the exact SQL that live recorded for version 0041. Repo migration 0044 (`repair_deletion_function.sql`) was later added to repair/reconcile the deletion function shape on fresh builds; that makes fresh replay converge, but it does not make live version 0041's stored statements identical to repo 0041.

### 3. 0039 is not a clean timestamped equivalent

Repo 0039 is `0039_listening_review_bucket.sql` (private `course-audio-review` bucket + schema guard update including that bucket). Live has no `listening_review_bucket` row; instead it has `20261122185507 extend_schema_guard_listening_audio_trials`, which is a different migration name and different content. Any plan must treat 0039 as a reconciliation problem, not a simple rename.

### 4. Missing stored statements

Live rows for 0042–0046 and 20261122190000/20261122190100 have `statements = null`. That means the history table records that versions were applied, but not the SQL text. It reduces auditability and makes live-vs-repo comparison harder for those rows.

## Prospective standard for new migrations

**Adopted convention:** Every new migration uses the repo's numeric, zero-padded filename format and is recorded in live `supabase_migrations.schema_migrations` under that same numeric version. For example, a new file `0050_example_name.sql` is recorded with version `0050` and name `example_name`, not with a timestamp. Keep the applied SQL in `statements` when the apply path supports it.

This is a forward-looking rule, not a cleanup or renumbering of the historical rows above. In particular, leave the existing 0038/0039, 0041, and 0047/0048 history entries exactly as documented here: do not edit, rename, replace, or normalize those rows as part of adopting the convention. Any separate reconciliation plan remains subject to explicit approval.

Before adding a new migration, check the newest number on `main`, live history, and open PRs that touch `supabase-b1-b2/migrations/`; the numeric version must be unique across all three.

## Historical reconciliation plan (separate approval required; not executed)

> **Do not execute this historical cleanup plan without explicit approval.** It concerns reconciling legacy rows/objects, not the prospective standard for new migrations. Steps marked "live write" change production metadata or schema; steps marked "repo change" change tracked files.

### Phase A — Read-only audit (complete for this write-up; re-run before execution)

1. **Read-only:** Re-fetch `supabase_migrations.schema_migrations` from live and confirm the rows in this document are still current.
2. **Read-only:** Confirm no open PR changes migration files in the 0038–0048 range.
3. **Read-only:** Capture current live definitions before any function-affecting migration work:
   ```sql
   select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure);
   select pg_get_functiondef('public.verify_delete_my_learning_data_coverage()'::regprocedure);
   select pg_get_functiondef('public.verify_app_schema()'::regprocedure);
   ```
4. **Read-only:** Confirm live object state for the 0039 mismatch: whether `course-audio-review` bucket exists, its `public` flag, and whether `verify_app_schema()` expects it.

### Phase B — Decide reconciliation targets (approval required)

5. **Decision:** For each timestamped row, choose the target numeric version/name after checking for collisions:
   - `20261122185247 listening_audio_trials` -> `0038 listening_audio_trials` (only if content/object state is reconciled).
   - `20261122185507 extend_schema_guard_listening_audio_trials` -> **needs explicit decision**. It is not repo 0039. Options:
     - **B1 (preferred for audit clarity):** keep the timestamp row as-is in live history and add a docs note; create a new numeric repo migration only if object state needs reconciliation. Do **not** rename it to 0039.
     - **B2:** insert a new numeric history row representing the actual applied guard change and leave the timestamp row documented as legacy; only with a careful duplicate-apply/no-op strategy.
   - `20261122190000 daily_review_cap` -> `0047 daily_review_cap`.
   - `20261122190100 week_vocab_deck` -> `0048 week_vocab_deck`.
6. **Decision:** For 0041, do **not** rewrite live history to pretend repo 0041 was applied as-is. Instead:
   - Keep live 0041 row as the historical applied version.
   - Add a follow-up reconciliation migration (new number, e.g. next free `0049+` after checking main/live/open PRs) that is idempotent and makes the live function definition match the intended repo state, **or** document that 0044 is the effective convergence point. The choice depends on whether the current live function body should exactly match a specific repo-authored definition.
7. **Decision:** Accept that 0042–0046/0047/0048 timestamp rows have `statements = null`. Backfilling statements is risky and may not be supported by the apply path; prefer documenting the gap over inventing history.

### Phase C — Repo changes (docs-only first; migration changes only after approval)

8. **Repo change:** Add/maintain this document with the final decision.
9. **Repo change (if approved):** Add a reconciliation migration only where needed. Any migration that replaces a function must first capture live `pg_get_functiondef` output for comparison (AGENTS.md rule).
10. **Repo change:** Do not rename already-applied migration files that would change replay identity unless the replay/CI and live history plan is explicit and approved.

### Phase D — Live metadata changes (high risk; approval required; do last)

11. **Live write (optional, only if approved):** For rows where name/content/object state is truly equivalent and collision risk is zero, update `supabase_migrations.schema_migrations` metadata in a single transaction, recording before/after rows. Example shape:
    ```sql
    -- EXAMPLE ONLY. DO NOT RUN WITHOUT APPROVAL.
    begin;
    select version, name from supabase_migrations.schema_migrations
    where version in ('20261122185247','20261122190000','20261122190100')
    order by version;
    -- perform carefully reviewed updates here
    -- verify
    select version, name from supabase_migrations.schema_migrations
    where version in ('0038','0047','0048')
    order by version;
    commit;
    ```
12. **Live write:** Do **not** use this simple rename path for 0039 because live name/content is not equivalent to repo 0039.
13. **Live write:** Do **not** edit 0041 statements/history in place to make it look like repo 0041. Prefer additive reconciliation.

### Phase E — Verification (read-only after changes)

14. **Read-only:** Re-query `supabase_migrations.schema_migrations` and diff against the pre-change snapshot.
15. **Read-only:** Run `verify_app_schema()` and `verify_delete_my_learning_data_coverage()` on live.
16. **Read-only/CI:** Run migration replay/CI guard against a fresh database; confirm no duplicate version, no missing object, and no function drift.

## Recommendation summary

- **Adopt numeric repo-version format as canonical** (already the repo convention).
- **Treat 0039 as an exception requiring reconciliation decision**, not a rename.
- **Treat 0041 as a historical content mismatch**; reconcile forward with an idempotent migration if needed, never by rewriting history to fake equivalence.
- **Do not backfill null `statements`** unless there is a safe, audited path.
- **Require explicit approval** before any live metadata update or reconciliation migration.
