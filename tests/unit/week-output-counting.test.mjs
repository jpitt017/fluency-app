import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { validSupportNotes } from '../../lib/curriculum/speaking-support.mjs';
import { fluencyFromWhisper, soundTips } from '../../lib/b1b2/speaking-feedback.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const week1 = details.weeks.find((week) => week.number === 1);
// A future published week without the dedicated Weeks 1–4 support must keep
// the original lab flow. The production bundle currently has only four weeks.
const laterWeek = { number: 5, speaking: { prompt: 'Describe a later weekly task.', model: 'A later weekly model.' } };
const testDetails = { ...details, weeks: [...details.weeks, laterWeek] };
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

function setup({ noAdmin = false, failWrite = false, throwWrite = false, failRefresh = false, duration = null } = {}) {
  const rows = [];
  const supportRows = [];
  const attempts = [];
  const uploads = [];
  const logs = [];
  let refreshes = 0;
  const client = {
    from(table) {
      assert.equal(table, 'speaking_attempts');
      return { insert(row) {
        attempts.push(row);
        return { select: () => ({ single: async () => ({ data: { id: 'saved-attempt' }, error: null }) }) };
      } };
    },
    rpc: async (name) => {
      if (name === 'evaluate_badges') return { data: [], error: null };
      assert.equal(name, 'refresh_current_week');
      refreshes += 1;
      if (failRefresh) throw new Error('private refresh failure');
      return { data: 1, error: null };
    },
  };
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
    '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json': testDetails,
    '@/utils/supabase/server': server,
    '@/utils/supabase/admin': { createAdminSupabase: () => admin },
  }, logs);

  class FakeGroq {
    audio = { transcriptions: { create: async () => ({ text: 'I spoke about a change in my life.', duration }) } };
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
    '@/lib/b1b2/deletion-generation.mjs': { requireUploadEpochForFencedRequest: async () => {} },
    '@/lib/curriculum/speaking-support.mjs': { validSupportNotes },
    '@/lib/curriculum/week-speaking-support': { speakingSupportLabels: (week) => week === 1 ? supportLabels : null, speakingSupportConfig: (week) => week >= 1 && week <= 4 ? {} : null },
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
    '@/lib/b1b2/speaking-evaluation': { evaluateSpeakingTranscript: async () => ({ validated, structure: null, cuePoints: [], cacheHit: true, promptTokens: 0, completionTokens: 0 }) },
    '@/lib/b1b2/speaking-feedback.mjs': { fluencyFromWhisper, soundTips },
    '@/lib/b1b2/observability': { logAiRequest: async () => {} },
    '@/lib/b1b2/provider-failure-response': { providerFailureResponse: async ({ error }) => { throw error; } },
    '@/lib/curriculum/learner-week': { loadLearnerWeek: async (number) => number === 1 ? {
      writingPrompt: week1.writing.prompt, speakingPrompt: week1.speaking.prompt,
    } : number === 5 ? { speakingPrompt: laterWeek.speaking.prompt } : null },
    '@/lib/curriculum/week-models': recording,
    '@/lib/b1b2/prompt-guard': {
      sanitizeLearnerText: (value, limit) => ({ text: String(value ?? '').slice(0, limit).trim() }),
      wrapLearnerSubmission: (value) => value,
    },
  };
  const writing = load('src/app/api/writing/correct/route.ts', modules, logs).POST;
  const speaking = load('src/app/api/speaking/evaluate/route.ts', modules, logs).POST;
  return { rows, supportRows, attempts, uploads, logs, writing, speaking, refreshes: () => refreshes };
}

function writingRequest(prompt = week1.writing.prompt, weekNumber = 1) {
  return { json: async () => ({ text: 'I wrote about a change in my life.', prompt, weekNumber }) };
}

function speakingRequest(prompt = week1.speaking.prompt, weekNumber = 1, isAudio = true, support = null, taskId = '') {
  const values = new Map([
    ['audio', { size: 16000, type: 'audio/webm' }], ['prompt', prompt], ['weekNumber', String(weekNumber)],
  ]);
  if (taskId) values.set('taskId', taskId);
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

test('weekly writing still counts, while direct weekly speaking must use the saved flow', async () => {
  const fixture = setup();
  const writing = await fixture.writing(writingRequest(`${week1.writing.prompt} Target grammar: past tense.`));
  const speaking = await fixture.speaking(speakingRequest());
  assert.equal(writing.status, 200);
  assert.equal(writing.body.weekRecorded, true);
  assert.equal(writing.body.modelAnswer, week1.writing.modelAnswer);
  assert.equal(speaking.status, 409);
  assert.match(speaking.body.error, /Week 1 page/);
  assert.equal(JSON.stringify(fixture.rows), JSON.stringify([{ user_id: 'learner-1', week_number: 1, skill: 'writing' }]));
  assert.equal(fixture.supportRows.length, 0);
  assert.equal(fixture.uploads.length, 0);
  assert.equal(fixture.refreshes(), 0);
});

test('a forged legacy first or second take cannot bypass the weekly ledger', async () => {
  const fixture = setup();
  const id = 'a12a4b34-46c2-4a49-8f72-123456789abc';
  for (const take of [1, 2]) {
    const response = await fixture.speaking(speakingRequest(week1.speaking.prompt, 1, true, { id, take }));
    assert.equal(response.status, 409);
  }
  assert.equal(fixture.rows.length, 0);
  assert.equal(fixture.uploads.length, 0);
});

test('a published week without dedicated support keeps its lab completion and model', async () => {
  const fixture = setup();
  const result = await fixture.speaking(speakingRequest(laterWeek.speaking.prompt, 5));
  assert.equal(result.status, 200);
  assert.equal(result.body.weekRecorded, true);
  assert.equal(result.body.modelAnswer, laterWeek.speaking.model);
  assert.equal(JSON.stringify(fixture.rows), JSON.stringify([{ user_id: 'learner-1', week_number: 5, skill: 'speaking' }]));
  assert.equal(fixture.refreshes(), 0);
  for (const failure of [{ noAdmin: true }, { failWrite: true }, { throwWrite: true }]) {
    const failed = setup(failure);
    const response = await failed.speaking(speakingRequest(laterWeek.speaking.prompt, 5));
    assert.equal(response.status, 200);
    assert.equal(response.body.weekRecorded, false);
    assert.equal(response.body.modelAnswer, null);
    assert.equal(response.body.transcript, 'I spoke about a change in my life.');
    assert.equal(failed.rows.length, 0);
  }
});

test('speaking task storage rounds fractional Whisper duration for its integer column', async () => {
  const fixture = setup({ duration: 12.4 });
  const result = await fixture.speaking(speakingRequest('A free speaking task', 1, true, null, 'task-1'));
  assert.equal(result.status, 200);
  assert.equal(result.body.fluency.seconds, 12.4);
  assert.equal(fixture.attempts.length, 1);
  assert.equal(fixture.attempts[0].duration_seconds, 12);
  assert.equal(result.body.attemptId, 'saved-attempt');
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

test('a failed writing progress save preserves feedback and reports that the task did not count', async () => {
  for (const failure of [{ noAdmin: true }, { failWrite: true }, { throwWrite: true }]) {
    const fixture = setup(failure);
    const writing = await fixture.writing(writingRequest());
    assert.equal(writing.status, 200);
    assert.equal(writing.body.corrected, 'A clearer sentence.');
    assert.equal(writing.body.weekRecorded, false);
    assert.equal(fixture.rows.length, 0);
    assert.ok(fixture.logs.length >= 1);
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
