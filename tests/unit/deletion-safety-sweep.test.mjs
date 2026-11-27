import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { sweepLateDeletionFiles } from '../../lib/b1b2/sweep-late-deletion-files.mjs';

const U = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const GENERATION = '33333333-3333-4333-8333-333333333333';
function fake(objects) {
  const files = new Map(objects.map(({ bucket, path, stale = true }) => [`${bucket}\0${path}`, { bucket, path, stale }]));
  const calls = [];
  const fault = {};
  return {
    files, calls, fault,
    async rpc(name, args) {
      assert.equal(name, 'list_late_deletion_files');
      calls.push(['list', args]);
      const rows = [...files.values()].filter((entry) => entry.stale && (!args.p_user_id || entry.path.startsWith(`${args.p_user_id}/`)))
        .sort((a, b) => Buffer.compare(Buffer.from(`${a.bucket}\0${a.path}`), Buffer.from(`${b.bucket}\0${b.path}`)))
        .filter((entry) => !args.p_after_bucket || entry.bucket > args.p_after_bucket || (entry.bucket === args.p_after_bucket && entry.path > args.p_after_name))
        .slice(0, args.p_limit).map((entry) => ({ bucket_id: entry.bucket, object_name: entry.path }));
      if (fault.badOwner) return { data: [{ bucket_id: 'issue-attachments', object_name: `${OTHER}/bad` }], error: null };
      if (fault.missingRpc) return { data: null, error: { code: 'PGRST202' } };
      return { data: fault.unordered ? rows.reverse() : rows, error: null };
    },
    storage: { from(bucket) { return { async remove(paths) {
      calls.push(['remove', bucket, [...paths]]);
      if (fault.partial) {
        fault.partial = false;
        files.delete(`${bucket}\0${paths[0]}`);
        return { data: null, error: { message: 'partial' } };
      }
      if (fault.shortAck) {
        fault.shortAck = false;
        return { data: [], error: null };
      }
      const removed = paths.filter((path) => files.delete(`${bucket}\0${path}`));
      return { data: removed.map((name) => ({ name })), error: null };
    } }; } },
  };
}

test('daily sweep catches late uploads on later runs and preserves identified new work', async () => {
  const initial = [
    { bucket: 'issue-attachments', path: `${U}/late.png` },
    { bucket: 'speaking-recordings', path: `${U}/old.webm` },
    { bucket: 'issue-attachments', path: `${U}/deletion-v1/${GENERATION}/fresh.png`, stale: false },
    { bucket: 'speaking-recordings', path: `${U}/current-take.webm`, stale: false },
    { bucket: 'issue-attachments', path: `${OTHER}/other.png`, stale: false },
  ];
  const f = fake(initial);
  assert.deepEqual(await sweepLateDeletionFiles(f, { userId: U }), { examined: 2, removed: 2, hasMore: false });
  assert.equal(f.files.has(`issue-attachments\0${U}/deletion-v1/${GENERATION}/fresh.png`), true);
  assert.equal(f.files.has(`speaking-recordings\0${U}/current-take.webm`), true);
  assert.equal(f.files.has(`issue-attachments\0${OTHER}/other.png`), true);
  // The old upload's final metadata arrives only after the first daily run.
  f.files.set(`issue-attachments\0${U}/very-late.png`, { bucket: 'issue-attachments', path: `${U}/very-late.png`, stale: true });
  assert.deepEqual(await sweepLateDeletionFiles(f, { userId: U }), { examined: 1, removed: 1, hasMore: false });
});

test('pagination, partial removal and repeated runs cannot lose candidates', async () => {
  const objects = Array.from({ length: 205 }, (_, i) => ({ bucket: 'speaking-recordings', path: `${U}/${String(i).padStart(4, '0')}.webm` }));
  const f = fake(objects);
  f.fault.partial = true;
  await assert.rejects(() => sweepLateDeletionFiles(f, { userId: U }), /Could not remove/);
  assert.equal(f.files.size, 204);
  const first = await sweepLateDeletionFiles(f, { userId: U, batchSize: 50, maxBatches: 2 });
  assert.deepEqual(first, { examined: 100, removed: 100, hasMore: true });
  const next = await sweepLateDeletionFiles(f, { userId: U, batchSize: 50 });
  assert.deepEqual(next, { examined: 104, removed: 104, hasMore: false });
  assert.equal(f.files.size, 0);
  assert.deepEqual(await sweepLateDeletionFiles(f, { userId: U }), { examined: 0, removed: 0, hasMore: false });
});

test('a short success response is ambiguous and does not claim the sweep finished', async () => {
  const path = `${U}/late-legacy.webm`;
  const f = fake([{ bucket: 'speaking-recordings', path }]);
  f.fault.shortAck = true;
  await assert.rejects(() => sweepLateDeletionFiles(f, { userId: U }), /Could not remove/);
  assert.equal(f.files.has(`speaking-recordings\0${path}`), true);
  assert.equal((await sweepLateDeletionFiles(f, { userId: U })).removed, 1);
  assert.equal(f.files.size, 0);
});

test('rejects invalid or foreign paths before attempting Storage removal', async () => {
  const f = fake([]);
  f.fault.badOwner = true;
  await assert.rejects(() => sweepLateDeletionFiles(f, { userId: U }), /Invalid late deletion file/);
  assert.equal(f.calls.some((call) => call[0] === 'remove'), false);
  await assert.rejects(() => sweepLateDeletionFiles(f, { userId: '../other' }), /Invalid sweep owner/);
});

test('an out-of-order page fails before removal instead of skipping candidates', async () => {
  const f = fake([
    { bucket: 'issue-attachments', path: `${U}/first.png` },
    { bucket: 'issue-attachments', path: `${U}/second.png` },
  ]);
  f.fault.unordered = true;
  await assert.rejects(() => sweepLateDeletionFiles(f, { userId: U }), /Unordered/);
  assert.equal(f.calls.some((call) => call[0] === 'remove'), false);
});

function cron({ configured = true, enabled = true, configError = null, result, error, progress, secret = 'test-cron-secret' } = {}) {
  const compiled = ts.transpileModule(readFileSync('src/app/api/cron/deletion-safety/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const logs = [];
  runInNewContext(compiled, { exports, process: { env: { CRON_SECRET: secret } }, console: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) }, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } };
    if (name === '@/lib/b1b2/sweep-late-deletion-files.mjs') return { sweepLateDeletionFiles: async (_admin, options) => {
      if (progress) options.onProgress(progress);
      if (error) throw error;
      return result ?? { examined: 2, removed: 2, hasMore: false };
    } };
    if (name === '@/utils/supabase/admin') return { createAdminSupabase: () => configured ? {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => configError
        ? { data: null, error: { code: configError } } : { data: { sweep_enabled: enabled }, error: null } }) }) }),
    } : null };
    throw new Error(name);
  } });
  return { GET: exports.GET, logs };
}
const request = (header) => ({ headers: { get: () => header } });

test('daily cron requires its secret, logs only counts and reports old-schema compatibility', async () => {
  const f = cron();
  assert.equal((await f.GET(request('wrong'))).status, 401);
  const success = await f.GET(request('Bearer test-cron-secret'));
  assert.equal(success.status, 200);
  assert.equal(success.body.removed, 2);
  assert.equal(JSON.stringify(f.logs).includes(U), false);
  assert.equal((await cron({ configured: false }).GET(request('Bearer test-cron-secret'))).status, 503);
  const old = await cron({ configError: 'PGRST205' }).GET(request('Bearer test-cron-secret'));
  assert.equal(old.status, 200);
  assert.equal(old.body.skipped, 'old-schema');
  const disabled = await cron({ enabled: false }).GET(request('Bearer test-cron-secret'));
  assert.equal(disabled.body.skipped, 'not-enabled');
  assert.equal((await cron({ result: { examined: 100, removed: 100, hasMore: true } }).GET(request('Bearer test-cron-secret'))).status, 503);
  const failed = cron({ error: new Error('no'), progress: { examined: 150, removed: 100 } });
  assert.equal((await failed.GET(request('Bearer test-cron-secret'))).status, 503);
  assert.equal(JSON.stringify(failed.logs).includes('"examined":150'), true);
  assert.equal(JSON.stringify(failed.logs).includes('"confirmedRemoved":100'), true);
  assert.equal(JSON.stringify(failed.logs).includes(U), false);
});
