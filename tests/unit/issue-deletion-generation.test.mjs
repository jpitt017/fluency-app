import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import { readDeletionGeneration } from '../../lib/b1b2/deletion-generation.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const GENERATION = '33333333-3333-4333-8333-333333333333';
function fixture({ markerError = null, failInsert = false, uploadError = false } = {}) {
  const uploads = []; const removals = []; let inserted;
  const admin = {
    from(table) {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => markerError
        ? { data: null, error: { code: markerError } }
        : { data: { data_deletion_generation: GENERATION }, error: null } }) }) };
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
    if (name === 'node:crypto') return crypto;
    if (name === '@/utils/supabase/server') return { createServerSupabase: async () => client };
    if (name === '@/utils/supabase/admin') return { createAdminSupabase: () => admin };
    if (name === '@/lib/b1b2/deletion-generation.mjs') return { readDeletionGeneration };
    if (name === '@/lib/curriculum/current-week') return { currentLearnerWeek: async () => 1 };
    if (name === '@/lib/b1b2/transcription') return { transcribeAudio: async () => 'test' };
    if (name === '@/lib/b1b2/observability') return { logAiRequest: async () => {} };
    if (name === '@/lib/issues/email') return { sendIssueAlert: async () => {} };
    throw new Error(name);
  } });
  const form = new FormData();
  form.set('type', 'feedback'); form.set('mode', 'text'); form.set('message', 'Fixture report');
  form.set('page', 'https://example.test/week/1?private=1');
  form.set('screenshot', new File([Buffer.from('89504e470d0a1a0a', 'hex')], 'test.png', { type: 'image/png' }));
  return { POST: exports.POST, uploads, removals, get inserted() { return inserted; }, request: { formData: async () => form } };
}

test('new issue request binds uploaded path and row to its starting deletion generation', async () => {
  const f = fixture();
  assert.equal((await f.POST(f.request)).status, 201);
  assert.equal(f.uploads.length, 1);
  assert.match(f.uploads[0].path, new RegExp(`^${USER}/deletion-v1/${GENERATION}/`));
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
