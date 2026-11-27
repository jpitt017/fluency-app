# Retryable learning-data deletion: 0081 rollout notes

**Proposed only.** Migration 0081, its cron, and both activation flags are not
live merely because this PR exists. The owner accepted the existing
mixed-version deletion/upload risk temporarily because there are no real
learners yet. This is a specific exception, not a relaxation of the standing
two-way compatibility rule. Do not deploy, alter production migration history,
enable the sweep, or run a live deletion without the required separate owner
approval.

## What changes after deployment

- The new route records a durable owner-scoped pending job before removing
  Storage files. It lists metadata from both private buckets, including
  unreferenced keys, removes through the Storage API, then atomically deletes
  database rows only after the metadata list is empty. Partial or ambiguous
  removal leaves the job pending. A worker lease can expire without expiring
  the deletion barrier.
- The new browser keeps a user-bound signed receipt before the destructive
  phase. Retrying that same receipt, including after a lost completion response,
  does not delete later work. A different browser/device without that receipt
  cannot identify the earlier request as the same retry; a fresh confirmation
  there is a new request. An old one-step client has the prior ambiguity.
- The old shared AI evaluation cache can contain learner-derived text but had
  no owner. The migration **discards all existing cache entries** because they
  cannot reliably be attributed, then keeps future feedback per owner and erases
  that owner's cache in the same transaction as their other learning rows. Old
  app RPC signatures still work; new app instances on 0080 temporarily skip
  caching. While running the new deletion worker on 0080, it must clear the
  entire shared cache to remove a learner's unattributable entries; other users'
  cached results will be regenerated as needed. Old app instances on 0080 can
  still repopulate it until the schema expands. This is a cache loss, not a
  deletion of another learner's stored submissions. Some replayed schemas also
  have an old global expiry clause in the deletion function; 0081 removes only
  the exact known clause so it cannot interfere with another pending job. Normal
  expiry remains the retention cron's responsibility. The migration aborts if
  the body contains a second known clause or any other direct textual mention
  of `ai_evaluation_cache`, including quoted or unqualified references and
  comments. This conservative text check cannot detect indirect or dynamically
  constructed references, so the complete live function still requires review.
- Completed deletions keep a minimal generation and completion timestamp in the
  retained account profile. New issue attachments have generation-tagged paths;
  new weekly recordings carry generation metadata. The database rejects a new
  client's stale-generation upload/report even if it arrives after completion.
  Weekly uploads also retain the existing 0080 reservation check. After a
  deletion, a generation-tagged recording must use a newly reserved weekly
  key even while the legacy fence is off, so it cannot reuse an old key that a
  delayed worker might still remove.
- The daily `/api/cron/deletion-safety` job, once separately enabled, scans both
  buckets for files belonging to accounts with recorded completed deletions. It
  removes old/untagged candidates through the Storage API and logs **counts
  only**. A fresh generation-tagged issue attachment or recording, including an
  unreferenced fresh recording, is preserved; current weekly ledger entries are
  also preserved. It examines later arrivals on later runs, regardless of when
  they arrive. Partial failure remains for a subsequent run. The retention
  marker is removed if the login account itself is deleted.
- `data_deletion_safety_config.enforce_legacy_fence` and `sweep_enabled` both
  default to **false**. The fence rejects stale untagged uploads for accounts
  that have deleted data, and makes pre-receipt browser pages refresh before
  deletion. Teacher pilot-access changes pin the target learner's generation
  before the roster is loaded, so a stale teacher request cannot recreate a
  deleted assignment. Existing Stripe billing updates and the scheduled
  retention cleanup remain available during a pending deletion. A service-role
  grouped issue alert may update only the email bookkeeping fields on an
  existing report; its page-wide update cannot block another owner or recreate
  a deleted report. The fence is a
  contract step only after all old app instances and browser clients are
  retired; an old teacher page for a deleted learner must refresh. Enabling the
  sweep starts real Storage deletion.

## Accepted mixed-version limitations

| App/schema pair | Functionality and safety during the overlap |
| --- | --- |
| Old app / new schema, flags off | Existing finite-lock deletion still works; successful completion records a marker and clears that learner's newly scoped cache. The old app still removes referenced paths only and does not create a durable job before Storage removal. The later sweep can find untagged late/orphan files. |
| New app / old 0080 schema | The new route uses the existing lock row for the pending job and supports retry, uploads use legacy paths/metadata, and deletion clears the entire ownerless cache. New app instances skip that legacy cache. Old app instances can still repopulate it. The old schema cannot fence non-weekly uploads or record a completion marker for the sweep; its existing upload race remains. |
| New app / new schema, flags off | The new job, generation checks and retry receipt work. Untagged legacy uploads can still arrive after completion until the fence is activated. |
| New app / new schema, flags on | New-generation files are fenced and the daily safety net runs. An obsolete one-step browser page must refresh. This contract state is **not** compatible with restarting an old app for a learner who has deleted data; rollback needs the procedure below. |

No scheme can tell an untagged legacy upload begun before deletion from an
untagged legitimate upload begun after it. Consequently, after a learner has
completed deletion, the safety net will treat **all untagged legacy files** as
candidates. If a legacy client created genuinely new untagged work during the
overlap, enabling the sweep could remove it. Review aggregate candidate counts
and obtain explicit owner approval before enabling it. Late legacy report rows
may also have been saved after deletion in the overlap; the file sweep does not
claim to remove or distinguish such rows. This is why the exception ends before
pilot, not why it is safe to leave legacy instances running.

Storage removal is by key, not a conditional object-version deletion. The
supported app writers use fresh random, non-overwriting issue and recording
keys, and the expanded schema requires a fresh reservation for tagged recordings
following deletion. The existing `speaking-recordings` owner policy also allows
legacy/direct clients to write arbitrary untagged keys while the fence is off.
If such a client reuses an old key for genuinely new bytes, an already-snapshotted
worker or sweep can remove those bytes. This is another form of the accepted
legacy overlap risk; retire all such writers before enabling the fence and sweep.
Do not introduce a new key-reusing writer without a reviewed version-aware
removal scheme. The old 0080 schema cannot enforce this protection.

The sweep cannot retroactively identify a deletion that completed entirely on
0080 before its completion marker existed. Plan a schema-first rollout of 0081
so completions are recorded before the new route is deployed. An old request
that completes before schema expansion is in the explicitly accepted overlap
risk; do not claim the sweep covers it. Do not backfill all accounts as deleted.

## Reviewed rollout / activation checklist

1. Obtain approval for this exact rollout and separately for the first sweep's
   potential Storage deletions. Check newest migration numbers on main, live
   numeric history and open PRs. Recheck bucket privacy/versioning and the two
   existing schema/deletion coverage verifiers. Count the shared cache entries
   that this migration will discard (23 on the read-only check during development;
   recheck at rollout). Capture and compare the **live** definitions of
   `public.delete_my_learning_data()`,
   `public.finish_week_speaking_deletion(uuid,uuid)`,
   `public.get_ai_eval_cache(text)` and
   `public.set_ai_eval_cache(text,text,text,jsonb)` before replacing them. The
   inspected live 0080 deletion function had no cache expiry clause; recheck
   the entire body, including indirect or dynamic cache access that the textual
   guard cannot identify. A remaining textual table-name reference aborts.
   Never include cache contents, account emails or learner audio in evidence.
2. After CI/review and approval, expand the schema with the exact reviewed 0081
   migration and the numeric `0081` history record **atomically** according to
   `docs/CONTENT_PIPELINE.md`. Leave both flags false. The old app can still
   work; successful old-app deletions now record completion markers.
3. Before deploying the new app, confirm the hosted production gateway accepts
   the `x-fluency-data-generation` browser preflight for database writes. CI
   checks this read-only against the isolated E2E gateway; it does not prove the
   production gateway has the same configuration. Deploy the app only after
   that check and approval. Verify the live commit and check the actual
   deployment platform's instance/request drain evidence; a live `/api/version`
   alone does **not** prove every old in-flight request or browser page has retired.
4. Inspect **count-only** candidate totals and ensure no known legitimate new
   legacy work is among them. With separate approval and evidence all old
   consumers have retired, set `enforce_legacy_fence = true` and
   `sweep_enabled = true` as a reviewed operational change. Record when this
   really happened. The daily cron then removes candidates and logs counts.
   Do not claim activation until live read-only verification confirms both
   flags and the deployed version; the first cron run is a real deletion.
5. Verify logs/counts and both coverage functions without creating synthetic
   production users or deleting learner data. The owner may separately approve
   a live deletion test. Local replay, mocked provider tests, and isolated
   Supabase tests do not prove provider retention or physical byte reclamation.

## Rollback constraints

This is an additive forward fix, not a tested destructive reverse migration.
Before returning to old code, stop and review: the active fence deliberately
blocks old untagged uploads for accounts that deleted, old clients cannot resume
new durable jobs, and turning off the fence restores the accepted legacy race.
Drain/complete pending jobs with the new worker and separately approve any
change to flags or deployment. A schema rollback without a data-preserving plan
could lose the security markers or orphan files; do not drop them casually.

## Automated evidence

`tests/migration-compatibility.json` registers executable old-app/new-schema
and new-app/old-schema tests; PR CI runs them for changed migrations. The
check ensures evidence is present and executes it, but cannot determine whether
the tests cover all semantics. SQL replay exercises pending jobs, stale workers,
late uploads, owned cache deletion, both flags and new/other-user preservation.
Pre-0081 replay tests apply 0081 in rolled-back transactions: one checks legacy
cache conversion, and another drives the actual old and new deletion route
handlers against both real schema versions with a metadata-backed Storage fake,
including partial failure and retry. A concurrent local PostgreSQL test checks
both lock orderings for Storage metadata, cache writes and teacher pilot
assignments, and both lock orderings for cross-owner grouped alerts. SQL tests
also exercise pending-job billing/retention exemptions, reject stale or reused
recording keys, and reject learner or stale staff writes. The CI-wired isolated
Supabase RLS fixture uploads synthetic late files, runs the same worker, and
checks that new and other-user files survive. A separate isolated browser
fixture interrupts the real two-phase deletion after the job begins, then
resumes it and checks that an old receipt cannot erase later work. Neither is
a live production deletion. CI keeps both fixtures in the same isolated-project
lock as the schema rebuild, so another branch cannot replace the schema between
phases. Hosted Storage, hosted CORS, and the new GitHub CI run still need to
pass before rollout; synthetic Storage and browser fixtures do not prove them.
