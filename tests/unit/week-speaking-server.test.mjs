import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { validSupportNotes } from '../../lib/curriculum/speaking-support.mjs';
import { parseWeekSpeakingTakePath } from '../../lib/b1b2/week-speaking-recordings.mjs';
import * as speakingFeedbackAll from '../../lib/b1b2/speaking-feedback.mjs';

const details = JSON.parse(readFileSync('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const support = JSON.parse(readFileSync('supabase-b1-b2/content/curriculum/speaking-support-weeks-01-04.json')).weeks[0];
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ATTEMPT = '33333333-3333-4333-8333-333333333333';

function load(path, modules) {
  const source = readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports, require: (name) => { if (!(name in modules)) throw new Error(`Unexpected dependency ${name}`); return modules[name]; },
    process: { env: { GROQ_API_KEY: 'fake-key' } }, crypto: { randomUUID }, File, Blob, Date,
    console: { error() {} },
  });
  return exports.POST;
}

/** Exercise real route handlers with an isolated in-memory provider/storage/RPC. */
function fixture(options = {}) {
  const takes = new Map(); const checks = new Map(); const objects = new Map();
  const events = []; let checksUsed = 0;
  const auth = { auth: { getUser: async () => ({ data: { user: options.user === null ? null : { id: USER } }, error: null }) } };
  const admin = {
    async rpc(name, args) {
      events.push(name);
      if (name === 'reserve_week_speaking_take') {
        const path = `${args.p_user_id}/week-speaking/${args.p_week_number}/${ATTEMPT}/recording-${args.p_take_id}.${args.p_extension}`;
        takes.set(args.p_take_id, { id: args.p_take_id, user_id: args.p_user_id, week_number: args.p_week_number,
          kind: args.p_kind, source_take_id: args.p_source_take_id, selected_phrases: args.p_phrases, path, status: 'uploading' });
        return { data: { path, attemptId: ATTEMPT, sequence: 1 }, error: null };
      }
      if (name === 'finish_week_speaking_upload') {
        const row = takes.get(args.p_take_id); if (!row || row.status !== 'uploading') return { data: false, error: null };
        if (args.p_success && options.finaliseFalse) { row.status = 'upload_failed'; return { data: false, error: null }; }
        if (args.p_success && options.finaliseAmbiguous) { row.status = 'ready'; return { data: null, error: { message: 'lost acknowledgement' } }; }
        if (args.p_success && options.finaliseThrows) throw new Error('lost connection');
        if (!args.p_success && options.closeAmbiguous) return { data: null, error: { message: 'lost acknowledgement' } };
        row.status = args.p_success ? 'ready' : 'upload_failed'; return { data: true, error: null };
      }
      if (name === 'reserve_week_speaking_check') {
        const row = takes.get(args.p_take_id);
        if (!row || row.user_id !== args.p_user_id || row.status !== 'ready' || checksUsed >= 5) return { data: null, error: { message: 'conflict' } };
        row.status = 'checking'; checksUsed++; checks.set(args.p_check_id, row);
        return { data: { path: row.path, kind: row.kind, week: row.week_number, attemptId: ATTEMPT, sourceTakeId: row.source_take_id }, error: null };
      }
      if (name === 'finish_week_speaking_check') {
        const row = checks.get(args.p_check_id); if (!row) return { data: false, error: null };
        if (args.p_status === 'cancelled') checksUsed--;
        row.status = args.p_status === 'succeeded' ? 'checked' : 'ready';
        if (args.p_status === 'succeeded') { row.feedback = args.p_feedback; row.transcript = args.p_transcript; }
        checks.delete(args.p_check_id); return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'speaking-recordings');
      return {
        async upload(path, file, opts) { events.push(['upload', path, opts]); objects.set(path, file); if (options.uploadError) return { error: { message: 'lost acknowledgement' } }; return { error: null }; },
        async remove(paths) { events.push(['remove', ...paths]); for (const path of paths) objects.delete(path); return { error: null }; },
        async download(path) { events.push('download'); return { data: objects.get(path) ?? null, error: objects.has(path) ? null : { message: 'missing' } }; },
      };
    } },
    from(table) {
      assert.equal(table, 'week_speaking_takes');
      const filters = {};
      const query = { select() { return query; }, eq(key, value) { filters[key] = value; return query; },
        async maybeSingle() { const row = takes.get(filters.id); return { data: row?.user_id === filters.user_id ? row : null, error: null }; } };
      return query;
    },
  };
  class FakeGroq {
    audio = { transcriptions: { create: async (params) => {
      events.push(['whisper', params.response_format, params.timestamp_granularities]);
      if (options.providerError) throw new Error('private provider detail');
      return { text: options.transcript || 'I moved to a new city, which was exciting.', duration: 12,
        segments: [{ start: 0, end: 2 }, { start: 3.5, end: 7 }] };
    } } };
  }
  const modules = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers ?? {} }) } },
    'groq-sdk': FakeGroq,
    '../../../../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json': details,
    '@/utils/supabase/server': { createServerSupabase: async () => auth },
    '@/utils/supabase/admin': { createAdminSupabase: () => admin },
    '@/lib/curriculum/speaking-support.mjs': { validSupportNotes },
    '@/lib/curriculum/week-speaking-support': { speakingSupportConfig: (week) => week === 1 ? support : null },
    '@/lib/b1b2/week-speaking-recordings.mjs': { parseWeekSpeakingTakePath },
    '@/lib/b1b2/ai-guard': { enforceAiUsage: async (_client, endpoint, units) => {
      events.push(['guard', endpoint, units]);
      return options.denyQuota ? { allowed: false, response: { status: 429, body: { error: 'Daily limit' } } } : { allowed: true, userId: USER, headers: { 'X-AI-Units-Charged': String(units) } };
    } },
    '@/lib/b1b2/speaking-evaluation': { evaluateSpeakingTranscript: async (params) => {
      events.push(['evaluate', params.weekNumber, params.cueLabels]);
      return {
        validated: {
          feedback: 'Good ideas.',
          improvedResponse: 'I moved to a new city, which was exciting.',
          highlights: [{ text: "Since then, I've", label: 'Present perfect', explanation: 'Links past to now.' }],
          showExampleFirst: false,
          examplePromptMessage: null,
          areas: {
            grammar_and_vocabulary: { mark: 4, strength: 'Clear past verbs.', improvement: 'Add a time linker.' },
            discourse_management: { mark: 4, strength: 'Clear order.', improvement: 'Connect ideas.' },
            pronunciation: null,
            interactive_communication: null,
          },
          corrections: [],
          tips: [],
          errorPatterns: [],
          strengths: ['Clear past verbs.'],
          improvements: ['Add a time linker.'],
        },
        structure: { original: 'I moved to a new city, which was exciting.', upgraded: 'Although I was nervous, I moved.', explanation: 'Use although for a contrast.', structure: 'although' },
        cuePoints: [{ label: 'The change', quote: 'I moved' }],
        cacheHit: false,
        promptTokens: 1,
        completionTokens: 2,
      };
    } },
    '@/lib/b1b2/speaking-feedback.mjs': speakingFeedbackAll,
    '@/lib/b1b2/prompt-guard': { sanitizeLearnerText: (value, max) => ({ text: String(value ?? '').trim().slice(0, max) }) },
    '@/lib/b1b2/provider-failure-response': { providerFailureResponse: async () => ({ status: 503, errorMessage: 'redacted', response: { status: 503, body: { error: 'Please try again.' } } }) },
    '@/lib/b1b2/observability': { logAiRequest: async () => {} },
    '@/lib/curriculum/learner-week': { loadLearnerWeek: async () => ({ speakingPrompt: 'Tell me about a change.' }) },
  };
  return { takes, objects, events, checksUsed: () => checksUsed,
    capture: load('src/app/api/week/speaking/capture/route.ts', modules),
    check: load('src/app/api/week/speaking/check/route.ts', modules),
  };
}
function captureRequest(kind = 'first', extras = {}) {
  const values = new Map([
    ['audio', new File(['not real audio'], 'audio.webm', { type: 'audio/webm' })], ['weekNumber', '1'], ['kind', kind],
    ['notes', JSON.stringify(kind === 'first' ? support.planNotes.map((label) => ({ label, note: '' })) : [])],
    ['phrases', JSON.stringify(extras.phrases || [])], ['sourceTakeId', extras.sourceTakeId || ''],
  ]);
  return { formData: async () => ({ get: (key) => values.get(key) ?? null }) };
}
const checkRequest = (takeId) => ({ json: async () => ({ takeId }) });

test('first capture reserves an immutable private key, saves it, and spends no AI units', async () => {
  const f = fixture(); const response = await f.capture(captureRequest());
  assert.equal(response.status, 200);
  assert.equal(f.events[0], 'reserve_week_speaking_take');
  assert.equal(f.events.at(-1), 'finish_week_speaking_upload');
  assert.equal(f.events.some((item) => Array.isArray(item) && item[0] === 'guard'), false);
  const row = f.takes.get(response.body.takeId);
  assert.equal(row.status, 'ready');
  assert.equal(parseWeekSpeakingTakePath(row.path).userId, USER);
  assert.equal(f.events.find((item) => Array.isArray(item) && item[0] === 'upload')[2].upsert, false);
  assert.equal(JSON.stringify(response.body).includes('week-speaking/'), false);
});

test('a checked weekly take requests Whisper segments and charges six units after reserving', async () => {
  const f = fixture(); const capture = await f.capture(captureRequest());
  const response = await f.check(checkRequest(capture.body.takeId));
  assert.equal(response.status, 200);
  assert.equal(response.body.weekRecorded, true);
  assert.equal(response.body.fluency.seconds, 12);
  assert.equal(response.body.fluency.pauses, 1);
  assert.equal(response.body.soundTips.length <= 2, true);
  assert.equal(f.checksUsed(), 1);
  assert.ok(f.events.indexOf('reserve_week_speaking_check') < f.events.findIndex((event) => Array.isArray(event) && event[0] === 'guard'));
  assert.deepEqual(f.events.find((event) => Array.isArray(event) && event[0] === 'guard'), ['guard', '/api/speaking/evaluate', 6]);
  const whisper = f.events.find((event) => Array.isArray(event) && event[0] === 'whisper');
  assert.equal(whisper[1], 'verbose_json'); assert.equal(JSON.stringify(whisper[2]), '["segment"]');
  assert.equal(JSON.stringify(response.body).includes('week-speaking/'), false);
  assert.equal(f.takes.get(capture.body.takeId).status, 'checked');
});

test('daily quota denial cancels a reservation; provider failure consumes it but preserves the audio', async () => {
  for (const [options, expected] of [[{ denyQuota: true }, 0], [{ providerError: true }, 1]]) {
    const f = fixture(options); const capture = await f.capture(captureRequest());
    const response = await f.check(checkRequest(capture.body.takeId));
    assert.equal(response.status, options.denyQuota ? 429 : 503);
    assert.equal(f.checksUsed(), expected);
    assert.equal(f.takes.get(capture.body.takeId).status, 'ready');
    assert.equal(f.objects.size, 1);
    assert.doesNotMatch(JSON.stringify(response.body), /private provider detail/);
  }
});

test('say it again checks the saved target, charges two units, and never asks AI to diagnose a sound', async () => {
  const f = fixture({ transcript: 'Although I was nervous, I moved.' });
  const sourceId = randomUUID();
  f.takes.set(sourceId, { id: sourceId, user_id: USER, status: 'checked', feedback: { structure: { structure: 'although' } } });
  const capture = await f.capture(captureRequest('structure', { sourceTakeId: sourceId }));
  const response = await f.check(checkRequest(capture.body.takeId));
  assert.equal(response.status, 200);
  assert.equal(response.body.used, true);
  assert.equal(response.body.structure, 'although');
  assert.deepEqual(f.events.find((event) => Array.isArray(event) && event[0] === 'guard'), ['guard', '/api/speaking/evaluate', 2]);
  assert.equal(f.events.some((event) => Array.isArray(event) && event[0] === 'evaluate'), false);
});

test('bad phrase selections, failed uploads and foreign checks fail closed', async () => {
  const bad = fixture();
  assert.equal((await bad.capture(captureRequest('retry', { phrases: ['made up'] }))).status, 400);
  assert.equal(bad.events.length, 0);
  const failed = fixture({ uploadError: true });
  assert.equal((await failed.capture(captureRequest())).status, 503);
  assert.equal([...failed.takes.values()][0].status, 'upload_failed');
  const closeIndex = failed.events.lastIndexOf('finish_week_speaking_upload');
  const removalIndex = failed.events.findIndex((event) => Array.isArray(event) && event[0] === 'remove');
  assert.ok(closeIndex < removalIndex, 'close the upload before removing any possibly committed object');
  assert.equal(failed.objects.size, 0);
  const foreign = fixture(); const id = randomUUID();
  foreign.takes.set(id, { id, user_id: OTHER, status: 'ready' });
  assert.equal((await foreign.check(checkRequest(id))).status, 409);
  assert.equal(foreign.checksUsed(), 0);
});

test('upload finalisation distinguishes a rejection from an uncertain acknowledgement', async () => {
  const rejected = fixture({ finaliseFalse: true });
  assert.equal((await rejected.capture(captureRequest())).status, 503);
  assert.equal([...rejected.takes.values()][0].status, 'upload_failed');
  assert.equal(rejected.objects.size, 0);
  assert.ok(rejected.events.some((event) => Array.isArray(event) && event[0] === 'remove'));

  for (const options of [{ finaliseAmbiguous: true }, { finaliseThrows: true }]) {
    const uncertain = fixture(options);
    const response = await uncertain.capture(captureRequest());
    assert.equal(response.status, 503);
    assert.match(response.body.error, /may have been saved/);
    assert.equal(uncertain.objects.size, 1);
    assert.equal(uncertain.events.filter((event) => event === 'finish_week_speaking_upload').length, 1);
    assert.ok(!uncertain.events.some((event) => Array.isArray(event) && event[0] === 'remove'), 'a potentially committed recording must survive a lost response');
  }
  const closeUncertain = fixture({ uploadError: true, closeAmbiguous: true });
  assert.equal((await closeUncertain.capture(captureRequest())).status, 503);
  assert.equal(closeUncertain.objects.size, 1);
  assert.ok(!closeUncertain.events.some((event) => Array.isArray(event) && event[0] === 'remove'), 'keep the ledger while closing is uncertain');
});
