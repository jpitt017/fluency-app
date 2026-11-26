import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../lib/b1b2/observability.ts', import.meta.url), 'utf8');
const ROUTES = [
  'src/app/api/issues/route.ts',
  'src/app/api/writing/correct/route.ts',
  'src/app/api/week/sentence/route.ts',
  'src/app/api/speaking/evaluate/route.ts',
  'src/app/api/speaking/chat/route.ts',
  'src/app/api/speaking/transcribe/route.ts',
  'src/app/api/review/check-rewrite/route.ts',
  'src/app/api/mediation/feedback/route.ts',
];

function loadLogger({ adminClient }) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === 'server-only') return {};
      if (name === '@/utils/supabase/admin') return { createAdminSupabase: () => adminClient };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports;
}

function fakeClient() {
  const calls = [];
  return { calls, rpc: async (...args) => { calls.push(args); return { error: null }; } };
}

const params = { endpoint: '/api/test', model: 'test-model', statusCode: 200, latencyMs: 4 };

test('anonymous or absent sessions use the service-role logger, never an anon RPC', async () => {
  const anonymousClient = fakeClient();
  const adminClient = fakeClient();
  const { logAiRequest } = loadLogger({ adminClient });

  await logAiRequest(anonymousClient, params, false);
  await logAiRequest(null, params, false);

  assert.equal(anonymousClient.calls.length, 0);
  assert.equal(adminClient.calls.length, 2);
  assert.equal(adminClient.calls[0][0], 'log_ai_request');
  assert.equal('p_user_id' in adminClient.calls[0][1], false, 'SQL derives attribution from auth.uid()');
});

test('authenticated calls keep their session client for auth.uid() attribution', async () => {
  const userClient = fakeClient();
  const adminClient = fakeClient();
  const { logAiRequest } = loadLogger({ adminClient });

  await logAiRequest(userClient, params, true);

  assert.equal(userClient.calls.length, 1);
  assert.equal(userClient.calls[0][0], 'log_ai_request');
  assert.equal(adminClient.calls.length, 0);
});

test('migration 0061 revokes anon/public, retains trusted roles, derives the user and caps text', () => {
  const migration = readFileSync(new URL('../../supabase-b1-b2/migrations/0061_log_ai_request_hardening.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes('from public, anon'));
  assert.ok(migration.includes('to authenticated, service_role'));
  assert.ok(migration.includes('v_user_id uuid := auth.uid();'));
  assert.ok(migration.includes("left(coalesce(p_endpoint, ''), 200)"));
  assert.ok(migration.includes("left(coalesce(p_model, ''), 200)"));
  assert.ok(migration.includes('left(p_error_message, 500)'));
  assert.doesNotMatch(migration, /p_user_id/i);
});

test('all current AI route call sites use the shared bounded logger', () => {
  for (const route of ROUTES) {
    const routeSource = readFileSync(new URL(`../../${route}`, import.meta.url), 'utf8');
    assert.match(routeSource, /logAiRequest\(/, `${route} should keep its AI telemetry call`);
  }
  for (const route of [
    'src/app/api/writing/correct/route.ts',
    'src/app/api/speaking/evaluate/route.ts',
    'src/app/api/speaking/chat/route.ts',
    'src/app/api/speaking/transcribe/route.ts',
    'src/app/api/review/check-rewrite/route.ts',
    'src/app/api/mediation/feedback/route.ts',
  ]) {
    const routeSource = readFileSync(new URL(`../../${route}`, import.meta.url), 'utf8');
    assert.match(routeSource, /}, isSignedIn\);/, `${route} must choose the session or service-role logger`);
  }
  for (const route of ['src/app/api/issues/route.ts', 'src/app/api/week/sentence/route.ts']) {
    const routeSource = readFileSync(new URL(`../../${route}`, import.meta.url), 'utf8');
    assert.match(routeSource, /}, true\);/, `${route} is authenticated before logging`);
  }
  const sentence = readFileSync(new URL('../../src/app/api/week/sentence/route.ts', import.meta.url), 'utf8');
  assert.match(sentence, /endpoint: LOG_ENDPOINT/);
  assert.match(sentence, /const LOG_ENDPOINT = '\/api\/week\/sentence'/);
});
