# Week sentence support: migration 0059 rollout

This is a plan, not an approval to change a database, its history, or the live
app. Get the owner's approval before hosted E2E cleanup, production migration,
or release. Never test by mutating the production database.

## State captured before replacement

- The exact production `pg_get_functiondef` for `public.delete_my_learning_data()`
  is in `delete-my-learning-data-0059-live-before.json`, with its MD5 digest.
  Migration 0059 adds only the sentence-practice deletion branch and preserves
  the existing profile reset, other deletion branches and speaking audio paths.
- Production and the isolated E2E project already have 0060 and 0061, but did
  not have 0059 at the last read-only check. Recheck both histories, latest
  `main` and concurrent work before applying anything.
- The isolated E2E history also contained every other repository migration at
  that check. CI uses `db push --include-all` **only on the verified E2E
  project** to insert the missing 0059 before testing; it creates and cleans up
  disposable learners. Review unexpected pending migrations before proceeding.
- Production has older timestamped history entries. **Never use the E2E
  `--include-all` command against production**: it could replay historical
  migrations under new numbers.

## Production procedure, after approval and passing CI

1. Confirm the target is production project `ebzmkhrssgnzmixfsuso`, 0059 and
   its objects are absent, and the live deletion function still matches the
   captured digest. Stop for review if any assumption changed.
2. `node scripts/prepare-week-sentence-0059-rollout.mjs` prints one guarded SQL
   statement but does not connect to any database. Review that statement and
   the exact migration from the approved commit. The statement serializes
   cooperating rollouts, checks the version, target objects and deletion
   function, executes the migration verbatim, and records that same SQL under
   numeric version `0059` in `supabase_migrations.schema_migrations`.
3. Submit that one reviewed statement once, only after explicit approval. Its
   DDL, deletion-function patch, history row and notification are one atomic
   statement; do not rely on a connector-level `BEGIN`/`ROLLBACK`. If it fails,
   stop and investigate the state with read-only queries; do not blindly retry.
4. Verify the history row, table privileges, service-only RPC grants and
   deletion-function coverage read-only. Update from latest `main` and rerun CI
   before merging and releasing, as requested.

Disposable embedded-Postgres rehearsals replayed every project migration with
stubbed Supabase auth/storage prerequisites, tested the real deletion and
sentence SQL fixtures before and after reapplying 0043/0044 and 0059, and
proved an injected failure rolls back the guarded statement. They do **not**
replace the hosted CI tests against Supabase.

Do not remove the table or its deletion branch as a casual rollback once it may
contain learner work. Rollback and any data deletion require a separate,
reviewed plan and approval.
