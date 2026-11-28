import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { publicSpeakingSupport } from '../../lib/curriculum/speaking-support.mjs';
import { weekSpeakingAttemptRecordings, weekSpeakingTakeRecording } from '../../lib/b1b2/week-speaking-recordings.mjs';
import * as speakingFeedback from '../../lib/b1b2/speaking-feedback.mjs';

const support = JSON.parse(readFileSync('supabase-b1-b2/content/curriculum/speaking-support-weeks-01-04.json'));
const details = JSON.parse(readFileSync('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ATTEMPT = '33333333-3333-4333-8333-333333333333';
const FIRST = '44444444-4444-4444-8444-444444444444';
const RETRY = '55555555-5555-4555-8555-555555555555';
const key = (id) => `${USER}/week-speaking/1/${ATTEMPT}/recording-${id}.webm`;

function load(rows, { cap = Infinity, flowError = false } = {}) {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from(table) {
      const filters = [];
      const chain = {
        select() { return chain; }, eq(key, value) { filters.push([key, value]); return chain; },
        in(key, values) { filters.push([key, new Set(values)]); return chain; }, order() { return chain; },
        maybeSingle: async () => flowError && table === 'week_speaking_flows'
          ? { data: null, error: { message: 'weekly flow table is unavailable' } }
          : { data: get()[0] ?? null, error: null },
        then(resolve, reject) { return Promise.resolve({ data: get(), error: null }).then(resolve, reject); },
      };
      function get() { return (rows[table] ?? []).filter((row) => filters.every(([key, value]) => value instanceof Set ? value.has(row[key]) : row[key] === value)).slice(0, cap); }
      return chain;
    },
  };
  const modules = {
    'server-only': {},
    '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json': details,
    '../../supabase-b1-b2/content/curriculum/speaking-support-weeks-01-04.json': support,
    '@/utils/supabase/server': { createServerSupabase: async () => client },
    './speaking-support.mjs': { publicSpeakingSupport },
    '@/lib/b1b2/week-speaking-recordings.mjs': { weekSpeakingAttemptRecordings, weekSpeakingTakeRecording },
    '@/lib/b1b2/speaking-feedback.mjs': speakingFeedback,
  };
  const compiled = ts.transpileModule(readFileSync('lib/curriculum/week-speaking-support.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, Date, Set, console, require: (name) => { if (!(name in modules)) throw new Error(name); return modules[name]; } });
  return exports.loadWeekSpeakingSupport(1);
}
const attempt = { id: ATTEMPT, user_id: USER, week_number: 1, notes: [], first_recording_path: null, first_transcript: null, first_feedback: null, second_recording_path: null, second_transcript: null, second_feedback: null };
const flow = { user_id: USER, week_number: 1, attempt_id: ATTEMPT, first_take_id: FIRST, first_versions: 1, retry_count: 0, checks_used: 0, model_unlocked: false, active_upload_id: null, active_check_id: null, active_since: null };
const first = { id: FIRST, user_id: USER, week_number: 1, attempt_id: ATTEMPT, kind: 'first', sequence: 1, source_take_id: null, recording_path: key(FIRST), status: 'ready', transcript: null, feedback: null, selected_phrases: [] };

test('a saved, unchecked preview never exposes the model or its phrases', async () => {
  const result = await load({ week_speaking_flows: [flow], week_speaking_attempts: [attempt], week_speaking_takes: [first] });
  assert.equal(result.model, null);
  assert.equal(result.usefulPhrases.length, 0);
  assert.equal(result.first.id, FIRST);
  assert.equal(result.weekRecorded, false);
  assert.equal(JSON.stringify(result).includes(key(FIRST)), false);
});

test('before migration 0080, weekly speaking is unavailable and the model stays hidden', async () => {
  const legacyPath = `${USER}/week-speaking/1/${ATTEMPT}/take-1.webm`;
  const result = await load({
    week_speaking_attempts: [{ ...attempt, first_recording_path: legacyPath, first_transcript: 'An older answer.' }],
  }, { flowError: true });
  assert.equal(result.available, false);
  assert.equal(result.model, null);
  assert.equal(result.first, null);
  assert.equal(result.recordings.length, 0);
});

test('a checked kept take unlocks labelled content, reports actual completion and shows failed-try recovery', async () => {
  const checked = { ...first, status: 'checked', transcript: 'I moved to a new city.', feedback: {} };
  const retry = { ...first, id: RETRY, kind: 'retry', sequence: 1, recording_path: key(RETRY), status: 'ready' };
  const result = await load({
    week_speaking_flows: [{ ...flow, model_unlocked: true, checks_used: 2, retry_count: 1 }],
    week_speaking_attempts: [{ ...attempt, first_recording_path: key(FIRST), first_transcript: checked.transcript }],
    week_speaking_takes: [checked, retry, { ...retry, id: 'foreign', user_id: OTHER }],
    week_speaking_checks: [{ user_id: USER, week_number: 1, take_id: RETRY, status: 'failed' }],
    week_output_submissions: [{ user_id: USER, week_number: 1, skill: 'speaking' }],
  });
  assert.equal(result.weekRecorded, true);
  assert.ok(result.model.parts.length);
  assert.ok(result.usefulPhrases.length);
  assert.equal(result.tries[0].canMoveOn, true);
  assert.equal(result.recordings.length, 2);
  assert.equal(JSON.stringify(result).includes('/week-speaking/'), false);
});

test('a checked first take remains accessible if completion is missing, without claiming credit', async () => {
  const transcript = 'I moved to a new city.';
  const result = await load({
    week_speaking_flows: [{ ...flow, model_unlocked: true, checks_used: 1 }],
    week_speaking_attempts: [{ ...attempt, first_recording_path: key(FIRST), first_transcript: transcript }],
    week_speaking_takes: [{ ...first, status: 'checked', transcript, feedback: {} }],
  });
  assert.ok(result.model);
  assert.equal(result.weekRecorded, false);
  assert.equal(result.first?.status, 'checked');
});

test('failed upload rows cannot fill a PostgREST page and hide a saved take', async () => {
  const failed = Array.from({ length: 1001 }, (_, index) => ({ ...first, id: `failed-${index}`, status: 'upload_failed' }));
  const result = await load({
    week_speaking_flows: [flow], week_speaking_attempts: [attempt], week_speaking_takes: [...failed, first],
  }, { cap: 1000 });
  assert.equal(result.first?.id, FIRST);
  assert.equal(result.recordings.length, 1);
});

test('a late legacy attempt remains visible without falsely claiming credit or relabelling old scores', async () => {
  const path = `${USER}/week-speaking/1/${ATTEMPT}/take-1.webm`;
  const oldFeedback = { score: 45, fluency: { wordsPerMinute: 99 }, rubric: { pronunciation: 1 } };
  const result = await load({ week_speaking_attempts: [{ ...attempt, first_recording_path: path, first_transcript: 'I moved to a city.', first_feedback: oldFeedback }] });
  assert.ok(result.model);
  assert.equal(result.weekRecorded, false);
  assert.equal(result.first.id, null);
  assert.equal(result.first.feedback.score, undefined);
  assert.equal(result.first.feedback.fluency, undefined);
  assert.equal(result.first.feedback.rubric, undefined);
  assert.equal(result.recordings.length, 1);
  assert.equal(JSON.stringify(result).includes(path), false);
});
