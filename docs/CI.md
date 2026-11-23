# CI: what runs when, and what blocks a merge

`.github/workflows/ci.yml` runs on every pull request to `main`, every push to
`main` (which is what deploys), the nightly schedule at 03:00 UTC, and manual
dispatch.

## Required checks

Three checks are required to merge. All three are offline, deterministic and
need no external API:

| Check | What it proves |
| --- | --- |
| `build-and-offline-evals` | lint, syllabus/details validators, `eval:prompts --offline` (60 cases + 2 rewrite-injection checks), the unit suites, the live schema check, and a production build |
| `playwright-e2e` | the placement walk, the writing step, request timeouts and the service-worker install |
| `rls-isolation` | row-level security between learners |

`production-*` jobs only run on manual dispatch with their input ticked, and
`live-prompt-evals` only runs nightly or on dispatch. They are not merge gates.

## Why `live-prompt-evals` is not required

It is the only job that spends real Groq tokens, and **it shares one
`GROQ_API_KEY` with the product**: the writing-feedback route calls
`openai/gpt-oss-20b` on the same key. A full pass costs roughly 220k tokens
against a 200k token-per-day organisation cap, so one run consumes the whole
day's budget and learners get 429s until it resets.

Because of that:

- it runs nightly and on manual dispatch, **never on a pull request**;
- it is **not a required check**, so a quota error or a red model result cannot
  block a merge;
- prompt changes still get a fast, deterministic gate on every PR through
  `npm run eval:prompts -- --offline` inside `build-and-offline-evals`.

The job reports itself: failures list the case ids with the categories the model
actually returned, and a run that cannot start prints its HTTP status (with any
bearer token redacted). Both go to the step summary and to a check annotation,
so the verdict is readable without downloading the job log.

## Nightly quota

A scheduled run at 03:00 UTC spends the day's Groq budget before learners use
the app, which reliably breaks writing feedback for that day, including manual
dispatches of the same job. Until the key is on a paid tier with headroom, treat
the nightly as a canary that the prompt suite still passes against the live
model — not as something to leave running unattended while the app is in use.
