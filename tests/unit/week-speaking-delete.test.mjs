import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const base = `${USER}/week-speaking/1/33333333-3333-4333-8333-333333333333/`;
function setup({ busy = false, beginFailure = false, storageFailure = false, finishFailure = false, pageCap = Infinity, extraTakes = 0 } = {}) {
  const calls = [];
  const rows = {
    issue_reports: [], speaking_attempts: [],
    week_speaking_attempts: [{ first_recording_path: `${base}take-1.webm`, second_recording_path: null }],
    week_speaking_takes: [
      { recording_path: `${base}recording-first.webm` }, { recording_path: `${base}recording-retry.webm` },
      { recording_path: `${base}recording-practice.webm` }, { recording_path: `${base}take-1.webm` },
      { recording_path: `${OTHER}/private.webm` }, { recording_path: `${USER}/../foreign.webm` },
      ...Array.from({ length: extraTakes }, (_, i) => ({ recording_path: `${base}extra-${i}.webm` })),
    ],
  };
  const admin = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'begin_week_speaking_deletion') return beginFailure
        ? { data: null, error: { message: 'deletion barrier is not available' } }
        : { data: !busy, error: null };
      if (name === 'finish_week_speaking_deletion') return { data: finishFailure ? null : { deleted: true }, error: finishFailure ? { message: 'expired token' } : null };
      return { data: null, error: null };
    },
    from(table) { return { select(_columns, options) { assert.equal(options.count, 'exact'); return {
      eq(key, value) { assert.equal(key, 'user_id'); assert.equal(value, USER); return {
        order() { return { async range(start, end) {
          calls.push(['page', table, start]);
          return { data: rows[table].slice(start, Math.min(end + 1, start + pageCap)), count: rows[table].length, error: null };
        } }; },
      }; },
    }; } }; },
    storage: { from(bucket) { return { async remove(paths) { calls.push(['remove', bucket, [...paths]]); return storageFailure ? { error: { message: 'failure' } } : { error: null, data: paths }; } }; } },
  };
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: USER } } }) } };
  const compiled = ts.transpileModule(readFileSync('src/app/api/account/delete-data/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, crypto: { randomUUID }, console: { error() {} }, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } };
    if (name === '@/utils/supabase/admin') return { createAdminSupabase: () => admin };
    if (name === '@/utils/supabase/server') return { createServerSupabase: async () => supabase };
    throw new Error(name);
  } });
  return { POST: exports.POST, calls };
}
const request = { json: async () => ({ confirm: 'DELETE' }) };

test('delete-data locks first and removes all owned old/new keys before deleting rows', async () => {
  const f = setup(); const result = await f.POST(request);
  assert.equal(result.status, 200);
  assert.equal(f.calls[0][0], 'begin_week_speaking_deletion');
  const remove = f.calls.find((call) => call[0] === 'remove');
  assert.equal(remove[1], 'speaking-recordings');
  assert.deepEqual(remove[2].sort(), [`${base}take-1.webm`, `${base}recording-first.webm`, `${base}recording-retry.webm`, `${base}recording-practice.webm`].sort());
  const finish = f.calls.find((call) => call[0] === 'finish_week_speaking_deletion');
  assert.ok(f.calls.findIndex((call) => call[0] === 'remove') < f.calls.indexOf(finish));
  assert.equal(finish[1].p_user_id, USER);
  assert.equal(f.calls[0][1].p_lock_id, finish[1].p_lock_id);
  assert.equal(f.calls.at(-1)[0], 'end_week_speaking_deletion');
  assert.equal(f.calls[0][1].p_lock_id, f.calls.at(-1)[1].p_lock_id);
});

test('a storage failure keeps rows for retry and releases the lock', async () => {
  const f = setup({ storageFailure: true }); const result = await f.POST(request);
  assert.equal(result.status, 503);
  assert.equal(f.calls.some((call) => call[0] === 'finish_week_speaking_deletion'), false);
  assert.equal(f.calls.at(-1)[0], 'end_week_speaking_deletion');
});

test('deletion does not begin while an upload or check is in flight', async () => {
  const f = setup({ busy: true }); const result = await f.POST(request);
  assert.equal(result.status, 409);
  assert.deepEqual(f.calls.map((call) => call[0]), ['begin_week_speaking_deletion']);
});

test('before migration 0080, the new route returns unavailable before touching any files or rows', async () => {
  const f = setup({ beginFailure: true }); const result = await f.POST(request);
  assert.equal(result.status, 503);
  assert.deepEqual(f.calls.map((call) => call[0]), ['begin_week_speaking_deletion']);
});

test('all pages and batches of private takes are deleted even with a smaller database page cap', async () => {
  const f = setup({ pageCap: 23, extraTakes: 240 }); const result = await f.POST(request);
  assert.equal(result.status, 200);
  const removals = f.calls.filter((call) => call[0] === 'remove' && call[1] === 'speaking-recordings');
  assert.equal(removals.flatMap((call) => call[2]).length, 244);
  assert.ok(removals.every((call) => call[2].length <= 100));
  assert.ok(f.calls.filter((call) => call[0] === 'page' && call[1] === 'week_speaking_takes').length > 1);
  assert.equal(f.calls.at(-2)[0], 'finish_week_speaking_deletion');
});

test('an expired deletion lease fails closed and releases only its original token', async () => {
  const f = setup({ finishFailure: true }); const result = await f.POST(request);
  assert.equal(result.status, 500);
  const finish = f.calls.find((call) => call[0] === 'finish_week_speaking_deletion');
  assert.ok(finish);
  assert.equal(f.calls.at(-1)[0], 'end_week_speaking_deletion');
  assert.equal(f.calls.at(-1)[1].p_lock_id, finish[1].p_lock_id);
});
