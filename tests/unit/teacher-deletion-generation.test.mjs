import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as epoch from '../../lib/b1b2/deletion-epoch.mjs';

const STAFF = '11111111-1111-4111-8111-111111111111';
const LEARNER = '22222222-2222-4222-8222-222222222222';
const GENERATION = '33333333-3333-4333-8333-333333333333';

function loadTs(file, modules) {
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, console: { error() {} }, require(name) {
    if (!(name in modules)) throw new Error(`Unexpected module ${name}`);
    return modules[name];
  } });
  return exports;
}

function rosterFixture(generationResult) {
  const events = [];
  const query = (table) => {
    const result = table === 'profiles' ? { data: { role: 'teacher' }, error: null }
      : { data: [], error: null };
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder,
      limit: () => builder, in: () => builder,
      maybeSingle: async () => result,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return builder;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: STAFF } } }) },
    from: (table) => { events.push(`from:${table}`); return query(table); },
    rpc(name) {
      events.push(`rpc:${name}`);
      if (name === 'teacher_get_data_deletion_generations') return generationResult;
      if (name === 'teacher_get_roster') return Promise.resolve({ data: [{ user_id: LEARNER }], error: null });
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const { loadTeacherRoster } = loadTs('lib/b1b2/data.ts', {
    '@/utils/supabase/server': { createServerSupabase: async () => client },
    '@/utils/supabase/admin': { createAdminSupabase: () => null },
    './feedback-schema': { ERROR_CATEGORY_LABELS: {} },
    './week-speaking-recordings.mjs': { weekSpeakingAttemptRecordings: () => [], weekSpeakingTakeRecording: () => null },
    './review-queue.mjs': { orderQueue() {}, planQueue() {} },
  });
  return { loadTeacherRoster, events };
}

test('staff pins each target generation before reading the roster, and 0080 remains usable', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const fixture = rosterFixture(pending);
  const loading = fixture.loadTeacherRoster();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(fixture.events.includes('rpc:teacher_get_data_deletion_generations'));
  assert.equal(fixture.events.includes('rpc:teacher_get_roster'), false, 'roster must wait for its generation snapshot');
  release({ data: { [LEARNER]: GENERATION }, error: null });
  const result = await loading;
  assert.equal(result.learners[0].deletion_generation, GENERATION);
  assert.ok(fixture.events.indexOf('rpc:teacher_get_data_deletion_generations') < fixture.events.indexOf('rpc:teacher_get_roster'));

  const old = rosterFixture(Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'not installed' } }));
  const legacy = await old.loadTeacherRoster();
  assert.equal(legacy.authorized, true);
  assert.equal(legacy.learners[0].deletion_generation, null);
  assert.match(readFileSync('components/b1b2/TeacherConsoleClient.tsx', 'utf8'), /deletionGeneration: selected\?\.deletion_generation/);
});

function pilotRoute(rpcError = null, signedIn = true) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: STAFF } : null } }) },
    rpc(name, args) {
      const call = { name, args, headers: {} };
      calls.push(call);
      const query = {
        setHeader(key, value) { call.headers[key] = value; return query; },
        then(resolve, reject) { return Promise.resolve({ error: rpcError }).then(resolve, reject); },
      };
      return query;
    },
  };
  const { POST } = loadTs('src/app/api/teacher/pilot/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    '@/utils/supabase/server': { createServerSupabase: async () => client },
    '@/lib/b1b2/deletion-epoch.mjs': epoch,
  });
  return { POST, calls };
}
const request = (body) => ({ json: async () => body });

test('teacher pilot route sends the target generation and accepts old-schema clients', async () => {
  const f = pilotRoute();
  assert.equal((await f.POST(request({ userId: LEARNER, enabled: true, deletionGeneration: GENERATION }))).status, 200);
  assert.equal(f.calls[0].name, 'teacher_set_pilot');
  assert.equal(f.calls[0].args.p_user_id, LEARNER);
  assert.equal(f.calls[0].headers[epoch.DELETION_TARGET_EPOCH_HEADER], GENERATION);
  assert.equal((await f.POST(request({ userId: LEARNER, enabled: false }))).status, 200);
  assert.equal(Object.keys(f.calls[1].headers).length, 0);
  assert.equal((await f.POST(request({ userId: LEARNER, enabled: true, deletionGeneration: 'bad' }))).status, 400);
  assert.equal(f.calls.length, 2, 'invalid generation must never reach the RPC');
  assert.equal((await pilotRoute(null, false).POST(request({ userId: LEARNER, enabled: true }))).status, 401);
});

test('stale staff work reports a refresh conflict without silently retrying', async () => {
  const f = pilotRoute({ code: 'P0001', message: 'stale' });
  const result = await f.POST(request({ userId: LEARNER, enabled: true, deletionGeneration: GENERATION }));
  assert.equal(result.status, 409);
  assert.match(result.body.error, /Refresh the roster/);
  assert.equal(f.calls.length, 1);
  assert.equal((await pilotRoute({ code: '42501' }).POST(request({ userId: LEARNER, enabled: true }))).status, 403);
});
