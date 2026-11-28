import { readFileSync } from 'node:fs';

// Only fixed stage names, retry numbers and durations are recorded. Reporting
// them as Actions annotations keeps timeout diagnostics visible even when the
// log archive is unavailable; no request data or credentials are included.
const file = process.env.E2E_AI_LOG_TIMING_FILE;
if (!file) throw new Error('Missing E2E_AI_LOG_TIMING_FILE');
const events = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const runs = new Map();
for (const event of events) {
  if (!Number.isInteger(event.retry) || event.retry < 0 || typeof event.label !== 'string' || !/^[a-zA-Z -]{1,80}$/.test(event.label)
      || !['start', 'finish'].includes(event.phase)
      || (event.phase === 'finish' && (!Number.isInteger(event.ms) || event.ms < 0))) {
    throw new Error('Invalid E2E AI logging timing event');
  }
  if (!runs.has(event.retry)) runs.set(event.retry, new Map());
  const stages = runs.get(event.retry);
  if (event.phase === 'start') stages.set(event.label, null);
  else {
    if (!stages.has(event.label)) throw new Error('E2E AI logging timing finish without start');
    stages.set(event.label, event.ms);
  }
}
if (runs.size === 0) console.log('::notice title=AI logging E2E timings::No stages were recorded.');
for (const [retry, stages] of runs) {
  const summary = [...stages].map(([label, ms]) => `${label}: ${ms === null ? 'interrupted' : `${ms}ms`}`).join('; ');
  console.log(`::notice title=AI logging E2E timings::Attempt ${retry + 1}: ${summary}`);
}
