import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { validSupportNotes } from '../../lib/curriculum/speaking-support.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const week1 = details.weeks.find((week) => week.number === 1);
const supportLabels = ['Before', 'The change', 'What was hard', 'What helped', 'Now'];

/** Execute the real routes and recording helper against in-memory fakes only. */
function load(path, modules, logs) {
  const compiled = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
    process: { env: { GROQ_API_KEY: 'fake-test-key' } },
    console: { error: (...args) => logs.push(args.map(String).join(' ')) },
  });
  return exports;
}

function setup({ noAdmin = false, failWrite = false, throwWrite = false, failRefresh = false } = {}) {
  const rows = [];
  const supportRows = [];
  const uploads = [];
  const logs = [];
  let refreshes = 0;
  const client = { rpc: async (name) => {
    assert.equal(name, 'refresh_current_week');
    refreshes += 1;
    if (failRefresh) throw new Error('private refresh failure');
    return { data: 1, error: null };
  } };
  const admin = noAdmin ? null : {
    storage: { from(bucket) {
      assert.equal(bucket, 'speaking-recordings');
      return {
        async upload(path, _file, options) { uploads.push({ path, options }); return { error: null }; },
        async remove(paths) { uploads.push({ removed: paths }); return { error: null }; },
      };
    } },
    from(table) {
      if (table === 'week_output_submissions') return { async upsert(row, options) {
        assert.equal(options.onConflict, 'user_id,week_number,skill');
        if (throwWrite) throw new Error('private write exception');
        if (failWrite) return { error: { message: 'private write failure' } };
        rows.push(row);
        return { error: null };
      } };
      assert.equal(table, 'week_speaking_attempts');
      return {
        async insert(row) { supportRows.push(row); return { error: null }; },
        update(values) {
          const chain = {
            eq() { return chain; }, not() { return chain; }, select() { return chain; },
            maybeSingle() { Object.assign(supportRows[0] ?? {}, values); return { data: supportRows[0] ?? null, error: null }; },
          };
          return chain;
        },
      };
    },
  };
  const server = { createServerSupabase: async () => client };
  const recording = load('lib/curriculum/week-models.ts', {
    'server-only': {},
    '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json': details,
    '@/utils/supabase/server': server,
    '@/utils/supabase/admin': { createAdminSupabase: () => admin },
  }, logs);

  class FakeGroq {
    audio = { transcriptions: { create: async () => ({ text: 'I spoke about a change in my life.' }) } };
  }
  const validated = {
    corrections: [], rubric: {}, score: 80, corrected: 'A clearer sentence.',
    improvedResponse: 'A clearer response.', feedback: 'Good work.', notes: [],
    errorPatterns: [], tips: [], strengths: [], improvements: [],
  };
  const modules = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'groq-sdk': FakeGroq,
    '@/utils/supabase/server': server,
    '@/utils/supabase/admin': { createAdminSupabase: () => admin },
    '@/lib/curriculum/speaking-support.mjs': { validSupportNotes },
    '@/lib/curriculum/week-speaking-support': { speakingSupportLabels: (week) => week === 1 ? supportLabels : null },
    '@/lib/b1b2/week-speaking-recordings.mjs': {
      weekSpeakingRecordingPath: ({ userId, weekNumber, attemptId, takeNumber }) =>
        `${userId}/week-speaking/${weekNumber}/${attemptId}/take-${takeNumber}.webm`,
      recordingContentTypeFromPath: () => 'audio/webm',
    },
    '@/lib/b1b2/ai-guard': { enforceAiUsage: async () => ({ allowed: true, headers: {}, userId: 'learner-1' }) },
    '@/lib/b1b2/eval-cache': { buildEvalCacheKey: () => 'fake', readEvalCache: async () => validated, writeEvalCache: async () => {} },
    '@/lib/b1b2/feedback-schema': {
      buildWritingSystemPrompt: () => '', buildSpeakingSystemPrompt: () => '',
      persistLearnerErrors: async () => {},
      validateWritingFeedback: () => validated, validateSpeakingFeedback: () => validated,
    },
    '@/lib/b1b2/groq-json': { createGroqJsonCompletion: async () => { throw new Error('The fake cached feedback must be used'); } },
    '@/lib/b1b2/observability': { logAiRequest: async () => {} },
    '@/lib/b1b2/provider-failure-response': { providerFailureResponse: async ({ error }) => { throw error; } },
    '@/lib/curriculum/learner-week': { loadLearnerWeek: async (number) => number === 1 ? {
      writingPrompt: week1.writing.prompt, speakingPrompt: week1.speaking.prompt,
    } : null },
    '@/lib/curriculum/week-models': recording,
    '@/lib/b1b2/prompt-guard': {
      sanitizeLearnerText: (value, limit) => ({ text: String(value ?? '').slice(0, limit).trim() }),
      wrapLearnerSubmission: (value) => value,
    },
  };
  const writing = load('src/app/api/writing/correct/route.ts', modules, logs).POST;
  const speaking = load('src/app/api/speaking/evaluate/route.ts', modules, logs).POST;
  return { rows, supportRows, uploads, logs, writing, speaking, refreshes: () => refreshes };
}

function writingRequest(prompt = week1.writing.prompt, weekNumber = 1) {
  return { json: async () => ({ text: 'I wrote about a change in my life.', prompt, weekNumber }) };
}

function speakingRequest(prompt = week1.speaking.prompt, weekNumber = 1, isAudio = true, support = null) {
  const values = new Map([
    ['audio', { size: 16000, type: 'audio/webm' }], ['prompt', prompt], ['weekNumber', String(weekNumber)],
  ]);
  if (support) {
    values.set('supportAttemptId', support.id);
    values.set('takeNumber', String(support.take));
    values.set('supportNotes', JSON.stringify(supportLabels.map((label) => ({ label, note: `note for ${label}` }))));
  }
  return {
    headers: { get: () => isAudio ? 'multipart/form-data; boundary=fake' : 'application/json' },
    formData: async () => ({ get: (key) => values.get(key) ?? null }),
    json: async () => ({ transcript: 'I spoke about a change in my life.', prompt, weekNumber }),
  };
}

test('the real weekly writing and speaking routes record the correct week without refreshing each POST', async () => {
  const fixture = setup();
  const writing = await fixture.writing(writingRequest(`${week1.writing.prompt} Target grammar: past tense.`));
  const speaking = await fixture.speaking(speakingRequest());
  assert.equal(writing.status, 200);
  assert.equal(speaking.status, 200);
  assert.equal(writing.body.weekRecorded, true);
  assert.equal(speaking.body.weekRecorded, true);
  assert.equal(writing.body.modelAnswer, week1.writing.modelAnswer);
  assert.equal(speaking.body.modelAnswer, week1.speaking.model);
  assert.equal(JSON.stringify(fixture.rows), JSON.stringify([
    { user_id: 'learner-1', week_number: 1, skill: 'writing' },
    { user_id: 'learner-1', week_number: 1, skill: 'speaking' },
  ]));
  assert.equal(fixture.refreshes(), 0, 'progress recomputes on explicit page visits, not task POSTs');
});

test('the week speaking route stores notes, the first take and the optional retry under one attempt', async () => {
  const fixture = setup();
  const id = 'a12a4b34-46c2-4a49-8f72-123456789abc';
  const first = await fixture.speaking(speakingRequest(week1.speaking.prompt, 1, true, { id, take: 1 }));
  const retry = await fixture.speaking(speakingRequest(week1.speaking.prompt, 1, true, { id, take: 2 }));
  assert.equal(first.body.supportSaved, true);
  assert.equal(retry.body.supportSaved, true);
  assert.equal(fixture.supportRows.length, 1);
  assert.equal(fixture.supportRows[0].id, id);
  assert.equal(fixture.supportRows[0].notes.length, 5);
  assert.match(fixture.supportRows[0].first_recording_path, /take-1\.webm$/);
  assert.match(fixture.supportRows[0].second_recording_path, /take-2\.webm$/);
  assert.equal(fixture.supportRows[0].first_transcript, 'I spoke about a change in my life.');
  assert.equal(fixture.supportRows[0].second_transcript, 'I spoke about a change in my life.');
  assert.equal(fixture.uploads.length, 2);
});

test('other prompts, missing weeks and typed speaking do not count as a weekly task', async () => {
  const fixture = setup();
  for (const [result, expected] of [
    [await fixture.writing(writingRequest('An unrelated task')), false],
    [await fixture.writing(writingRequest('An unrelated task', 9)), null],
    [await fixture.speaking(speakingRequest('An unrelated task')), false],
    [await fixture.speaking(speakingRequest(week1.speaking.prompt, 1, false)), null],
  ]) {
    assert.equal(result.status, 200);
    assert.equal(result.body.weekRecorded, expected);
    assert.equal(result.body.modelAnswer, null);
  }
  assert.equal(fixture.rows.length, 0);
  assert.equal(fixture.refreshes(), 0);
});

test('a failed weekly save preserves feedback but reports that the task did not count', async () => {
  for (const failure of [{ noAdmin: true }, { failWrite: true }, { throwWrite: true }]) {
    const fixture = setup(failure);
    const writing = await fixture.writing(writingRequest());
    const speaking = await fixture.speaking(speakingRequest());
    assert.equal(writing.status, 200);
    assert.equal(speaking.status, 200);
    assert.equal(writing.body.corrected, 'A clearer sentence.');
    assert.equal(speaking.body.improvedResponse, 'A clearer response.');
    assert.equal(writing.body.weekRecorded, false);
    assert.equal(speaking.body.weekRecorded, false);
    assert.equal(fixture.rows.length, 0);
    assert.ok(fixture.logs.length >= 2);
  }
});

test('recording a weekly task does not invoke the progress RPC', async () => {
  const fixture = setup();
  const response = await fixture.writing(writingRequest());
  assert.equal(response.status, 200);
  assert.equal(response.body.weekRecorded, true);
  assert.equal(fixture.rows.length, 1);
  assert.equal(fixture.refreshes(), 0);
});
