# CI: what runs when, and what blocks a merge

`.github/workflows/ci.yml` runs on every pull request to `main`, every push to
`main` (which is what deploys), the nightly schedule at 03:00 UTC, and manual
dispatch. The schedule still exists because it is what proves the deployable
state is healthy when nobody has pushed; the one job it no longer runs is
`live-prompt-evals` — see [below](#live-prompt-evals-is-manual-dispatch-only).

## Required checks

Three checks are required to merge. The build and prompt evaluations are
offline; Playwright and RLS use a dedicated isolated Supabase project.

| Check | What it proves |
| --- | --- |
| `build-and-offline-evals` | lint, syllabus/details validators, offline prompt evaluations, unit suites and a production build |
| `playwright-e2e` | browser journeys against the isolated test project, with a per-run learner and a check that browser traffic does not reach live Supabase |
| `rls-isolation` | row-level security between learners on that isolated project |

The separate `live-schema-check` runs on main pushes, schedules and dispatches,
not on pull requests.

`production-*` jobs only run on manual dispatch with their input ticked, and
`live-prompt-evals` only runs on manual dispatch with its input ticked. They are
not merge gates.

## Shared isolated E2E migration history

The Playwright and RLS jobs use the dedicated E2E Supabase project, never live,
with the `e2e-isolated` concurrency group. A PR can apply a new migration to
that shared project before the migration reaches `main`. Supabase CLI then
refuses `db push` for a checkout that does not yet contain that remote version,
even with `--include-all`. For example, PR #106 applied `0062` to E2E before
the post-merge run for PR #105 failed in its migration step; that checkout could
not reconcile the extra version, though the unavailable Actions logs prevent
confirming it was the only failure. The feature's earlier PR checks had passed.

The E2E migration step runs `scripts/prepare-e2e-migration-history.mjs` after
verifying the project and credentials. It reads E2E history in a read-only
transaction and accepts **only** the explicitly listed, already-tested remote
version, name, and stored-SQL SHA-256. If its real file is absent from the
checkout, the script writes a CLI ledger sentinel under `RUNNER_TEMP`, outside
the repository. The sentinel unconditionally raises an exception if executed,
so it cannot create a history row on a fresh project or if history changes
between the read and push. If the real migration is present, its source hash
must also match. Unknown or changed remote-only migrations fail closed with an
annotation. No history row is repaired, deleted or inserted by the preflight;
`db push --include-all` remains restricted to the verified isolated project.

Remove the temporary `0062` exception once no tested checkout predates the real
migration. If a different remote-only migration is encountered, investigate its
identity and compatibility rather than repairing history or adding a blanket
placeholder. A separate fresh-database job still replays repository migrations
and tests learner-data deletion independently of the shared E2E project.

## Why `live-prompt-evals` is not required

It is the only job that spends real Groq tokens, and **it shares one
`GROQ_API_KEY` with the product**: the writing-feedback route calls
`openai/gpt-oss-20b` on the same key. A full pass costs roughly 220k tokens
against a 200k token-per-day organisation cap, so one run consumes the whole
day's budget and learners get 429s until it resets.

Because of that:

- it runs **only on manual dispatch with `live_prompt_evals` ticked**, never on a
  pull request and no longer on a schedule;
- it is **not a required check**, so a quota error or a red model result cannot
  block a merge;
- prompt changes still get a fast, deterministic gate on every PR through
  `npm run eval:prompts -- --offline` inside `build-and-offline-evals`.

The job reports itself: failures list the case ids with the categories the model
actually returned, and a run that cannot start prints its HTTP status (with any
bearer token redacted). Both go to the step summary and to a check annotation,
so the verdict is readable without downloading the job log.

## `live-prompt-evals` is manual dispatch only

**The nightly run is disabled.** The job's condition is

```yaml
if: github.event_name == 'workflow_dispatch' && inputs.live_prompt_evals == true
```

so it never starts on the `schedule` event, and a routine dispatch of the
workflow for some other reason (a production smoke test, say) does not start it
either. To run it, dispatch the workflow and tick **Run the live Groq prompt
gate (spends the day's Groq quota for the app)**.

### Why it was turned off

A scheduled run goes off at 03:00 UTC and spends the whole day's Groq budget
before learners wake up, which breaks writing feedback for that day — including
for a manual dispatch of the same job later on. That is a high price for an
unattended canary, and the run it produces has to be read by a person anyway.

In its last three nights the job passed twice and failed once.
[Run 45107954616](https://github.com/jpitt017/fluency-app/actions/runs/45107954616)
(23 Nov 2026) ended in `exit code 1` — the only detail its annotation exposes —
while `build-and-offline-evals`, `playwright-e2e` and `rls-isolation` all passed
on the same commit. That 03:46 run also exhausted the day's Groq budget: the
repo records it as the reason "every writing submission after it failed" (see
the commit that first scoped this job to the schedule). So the canary failed
unattended, spent the budget it shares with the product to do it, and gated
nothing — none of which is worth leaving switched on while the key is metered.

### Re-enabling it

Once `GROQ_API_KEY` is on a paid plan with headroom — enough that one full pass
(roughly 220k tokens) does not eat the day's organisation allowance — bring the
schedule back:

1. In `.github/workflows/ci.yml`, add back to the job's `if:`:

   ```yaml
   if: github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && inputs.live_prompt_evals == true)
   ```

2. Keep the dispatch input. It costs nothing and keeps routine dispatches cheap.
3. Update this page and the comment above the job, so the next reader does not
   have to work out which of the two states is current.

Do not re-enable the schedule while the key is still metered to a 200k
token-per-day cap: the first nightly of the month would be indistinguishable
from the outage that turned it off.
