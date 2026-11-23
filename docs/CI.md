# CI: what runs when, and what blocks a merge

`.github/workflows/ci.yml` runs on every pull request to `main`, every push to
`main` (which is what deploys), the nightly schedule at 03:00 UTC, and manual
dispatch. The schedule still exists because it is what proves the deployable
state is healthy when nobody has pushed; the one job it no longer runs is
`live-prompt-evals` — see [below](#live-prompt-evals-is-manual-dispatch-only).

## Required checks

Three checks are required to merge. All three are offline, deterministic and
need no external API:

| Check | What it proves |
| --- | --- |
| `build-and-offline-evals` | lint, syllabus/details validators, `eval:prompts --offline` (60 cases + 2 rewrite-injection checks), the unit suites, the live schema check, and a production build |
| `playwright-e2e` | the placement walk, the writing step, request timeouts and the service-worker install |
| `rls-isolation` | row-level security between learners |

`production-*` jobs only run on manual dispatch with their input ticked, and
`live-prompt-evals` only runs on manual dispatch with its input ticked. They are
not merge gates.

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

The schedule's recent record is not encouraging either: in the three nights
before it was switched off, [run 45107954616](https://github.com/jpitt017/fluency-app/actions/runs/45107954616)
(23 Nov 2026) ended in `exit code 1` while `build-and-offline-evals`,
`playwright-e2e` and `rls-isolation` all passed. A job that fails unattended,
spends the quota to do it, and gates nothing is worth turning off until its
budget is no longer shared with the product.

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
