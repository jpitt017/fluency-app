import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { hasExplicitUploadGeneration, readDeletionGeneration } from '../../lib/b1b2/deletion-generation.mjs';
import { freshRecordingKeyId } from '../../lib/b1b2/recording-key.mjs';
import { legacyRecordingKeyFixture } from '../helpers/legacy-recording-key-fixture.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const GENERATION = '33333333-3333-4333-8333-333333333333';
function fixture({ markerError = null, failInsert = false, uploadError = false, fence = false, keyError = false, legacyKeyError = false } = {}) {
  const uploads = []; const removals = []; const transcriptions = []; let inserted; let allocated = 0;
  const legacyAllocator = legacyRecordingKeyFixture();
  legacyAllocator.state.insertError = legacyKeyError;
  const admin = {
    rpc: async (name) => {
      assert.equal(name, 'allocate_recording_key');
      return keyError ? { data: null, error: { message: 'allocator offline' } }
        : { data: `f0000000-0000-8000-8000-${String(++allocated).padStart(12, '0')}`, error: null };
    },
    from(table) {
      if (table === 'ai_request_logs') return legacyAllocator.table;
      if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => markerError
        ? { data: null, error: { code: markerError } }
        : { data: { data_deletion_generation: GENERATION }, error: null } }) }) };
      if (table === 'data_deletion_safety_config') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { enforce_legacy_fence: fence }, error: null }) }) }) };
      if (table === 'issue_reports') return { insert: async (row) => { inserted = row; return { error: failInsert ? { message: 'stale generation' } : null }; } };
      throw new Error(table);
    },
    storage: { from(bucket) { return {
      upload: async (path, _file, options) => { uploads.push({ bucket, path, options }); return { error: uploadError ? { message: 'rejected' } : null }; },
      remove: async (paths) => { removals.push({ bucket, paths }); return { error: null }; },
    }; } },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    rpc: async (name) => { assert.equal(name, 'reserve_issue_report'); return { data: true, error: null }; },
  };
  const compiled = ts.transpileModule(readFileSync('src/app/api/issues/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, File, Buffer, URL, process: { env: {} }, console: { error() {} }, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } };
    if (name === '@/utils/supabase/server') return { createServerSupabase: async () => client };
    if (name === '@/utils/supabase/admin') return { createAdminSupabase: () => admin };
    if (name === '@/lib/b1b2/deletion-generation.mjs') return { hasExplicitUploadGeneration, readDeletionGeneration };
    if (name === '@/lib/b1b2/recording-key.mjs') return { freshRecordingKeyId };
    if (name === '@/lib/curriculum/current-week') return { currentLearnerWeek: async () => 1 };
    if (name === '@/lib/b1b2/transcription') return { transcribeAudio: async () => { transcriptions.push(true); return 'test'; } };
    if (name === '@/lib/b1b2/observability') return { logAiRequest: async () => {} };
    if (name === '@/lib/issues/email') return { sendIssueAlert: async () => {} };
    throw new Error(name);
  } });
  const form = new FormData();
  form.set('type', 'feedback'); form.set('mode', 'text'); form.set('message', 'Fixture report');
  form.set('page', 'https://example.test/week/1?private=1');
  form.set('screenshot', new File([Buffer.from('89504e470d0a1a0a', 'hex')], 'test.png', { type: 'image/png' }));
  return { POST: exports.POST, uploads, removals, transcriptions, get inserted() { return inserted; }, request: { headers: currentHeaders(), formData: async () => form } };
}

function currentHeaders() {
  return new Headers({ 'x-fluency-data-owner': USER, 'x-fluency-data-generation': GENERATION, 'x-fluency-upload-epoch-explicit': '1' });
}

function voiceRequest() {
  const wav = Buffer.alloc(46);
  wav.write('RIFF', 0); wav.writeUInt32LE(38, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(2, 40);
  const form = new FormData();
  form.set('type', 'feedback'); form.set('mode', 'voice'); form.set('page', 'https://example.test/week/1');
  form.set('audio', new File([wav], 'message.wav', { type: 'audio/wav' }));
  form.set('screenshot', new File([Buffer.from('89504e470d0a1a0a', 'hex')], 'test.png', { type: 'image/png' }));
  return { headers: currentHeaders(), formData: async () => form };
}

test('new issue request binds uploaded path and row to its starting deletion generation', async () => {
  const f = fixture();
  assert.equal((await f.POST(f.request)).status, 201);
  assert.equal(f.uploads.length, 1);
  assert.match(f.uploads[0].path, new RegExp(`^${USER}/deletion-v1/${GENERATION}/`));
  assert.equal(f.uploads[0].options.metadata.data_deletion_client, 'v1');
  assert.equal(f.inserted.data_deletion_generation, GENERATION);
  assert.equal(f.inserted.screenshot_path, f.uploads[0].path);
  assert.equal(f.inserted.page_url, 'https://example.test/week/1');
});

test('separate reports use fresh, non-overwriting attachment keys', async () => {
  const f = fixture();
  assert.equal((await f.POST(f.request)).status, 201);
  assert.equal((await f.POST(f.request)).status, 201);
  assert.notEqual(f.uploads[0].path, f.uploads[1].path);
  assert.ok(f.uploads.every(({ options }) => options.upsert === false));
});

test('voice reports and retries always use fresh, non-overwriting audio keys on either schema', async () => {
  for (const markerError of [null, '42703']) {
    for (const failure of [{}, { failInsert: true }, { uploadError: true }]) {
      const f = fixture({ markerError, ...failure });
      const expected = Object.keys(failure).length ? 503 : 201;
      assert.equal((await f.POST(voiceRequest())).status, expected);
      assert.equal((await f.POST(voiceRequest())).status, expected);
      const audio = f.uploads.filter(({ path }) => path.endsWith('-audio.wav'));
      assert.equal(audio.length, 2);
      assert.notEqual(audio[0].path, audio[1].path);
      assert.ok(audio.every(({ options }) => options.upsert === false));
      if (!failure.uploadError) {
        assert.equal(f.uploads.length, 4);
        assert.notEqual(f.uploads[1].path, f.uploads[3].path);
        assert.ok(f.uploads.every(({ options }) => options.upsert === false));
      }
    }
  }
});

test('stale issue pages are tagged during overlap and rejected once the fence is on', async () => {
  const overlap = fixture();
  overlap.request.headers = new Headers({ 'x-fluency-data-owner': USER, 'x-fluency-data-generation': GENERATION });
  assert.equal((await overlap.POST(overlap.request)).status, 201);
  assert.equal(overlap.uploads[0].options.metadata.data_deletion_client, 'legacy');
  const fenced = fixture({ fence: true });
  fenced.request.headers = overlap.request.headers;
  assert.equal((await fenced.POST(fenced.request)).status, 503);
  assert.equal(fenced.uploads.length, 0);
  const current = fixture({ fence: true });
  assert.equal((await current.POST(current.request)).status, 201);
});

test('an unavailable allocator fails before issue audio is transcribed or saved on either schema', async () => {
  for (const options of [{ keyError: true }, { markerError: '42703', legacyKeyError: true }]) {
    const f = fixture(options);
    assert.equal((await f.POST(voiceRequest())).status, 503);
    assert.equal(f.transcriptions.length, 0);
    assert.equal(f.uploads.length, 0);
    assert.equal(f.inserted, undefined);
  }
});

test('new issue route remains usable on the old schema with the documented legacy path', async () => {
  const f = fixture({ markerError: '42703' });
  assert.equal((await f.POST(f.request)).status, 201);
  assert.match(f.uploads[0].path, new RegExp(`^${USER}/[^/]+-screenshot$`));
  assert.equal('data_deletion_generation' in f.inserted, false);
});

test('a stale report insert removes its already uploaded attachment; unexpected marker errors fail closed', async () => {
  const stale = fixture({ failInsert: true });
  assert.equal((await stale.POST(stale.request)).status, 503);
  assert.deepEqual(Array.from(stale.removals[0].paths), [stale.uploads[0].path]);
  const broken = fixture({ markerError: 'connection-failed' });
  assert.equal((await broken.POST(broken.request)).status, 503);
  assert.equal(broken.uploads.length, 0);
});
