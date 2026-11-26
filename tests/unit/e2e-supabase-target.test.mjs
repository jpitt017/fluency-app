import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertE2ESupabaseTarget,
  E2E_PROJECT_REF,
  E2E_PROJECT_URL,
  LIVE_PROJECT_REF,
} from '../../scripts/assert-e2e-supabase-target.mjs';

const jwt = (ref) => `header.${Buffer.from(JSON.stringify({ ref })).toString('base64url')}.signature`;
const goodEnv = () => ({
  E2E_SUPABASE_PROJECT_REF: E2E_PROJECT_REF,
  E2E_SUPABASE_URL: E2E_PROJECT_URL,
  E2E_SUPABASE_ANON_KEY: jwt(E2E_PROJECT_REF),
  E2E_SUPABASE_SERVICE_ROLE_KEY: jwt(E2E_PROJECT_REF),
  E2E_SUPABASE_DB_URL: `postgresql://postgres.${E2E_PROJECT_REF}:not-a-real-password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
  E2E_RUN_ID: 'unit-run-123',
  E2E_RUN_ATTEMPT: '2',
  E2E_USER_EMAIL: 'e2e-unit-run-123-2@example.invalid',
  E2E_USER_PASSWORD: 'not-a-real-password',
});

test('accepts only the configured isolated E2E Supabase project', () => {
  assert.deepEqual(assertE2ESupabaseTarget(goodEnv()), {
    projectRef: E2E_PROJECT_REF,
    projectUrl: E2E_PROJECT_URL,
  });
});

test('fails closed if required E2E configuration is missing', () => {
  const env = goodEnv();
  delete env.E2E_SUPABASE_DB_URL;
  assert.throws(() => assertE2ESupabaseTarget(env), /Missing required E2E configuration: E2E_SUPABASE_DB_URL/);
});

test('rejects a shared E2E account that is not unique to the workflow attempt', () => {
  const env = goodEnv();
  env.E2E_USER_EMAIL = 'shared@example.invalid';
  assert.throws(() => assertE2ESupabaseTarget(env), /must be unique to this GitHub run and attempt/);
});

test('rejects a Next.js runtime URL that differs from the verified E2E target', () => {
  const env = goodEnv();
  env.NEXT_PUBLIC_SUPABASE_URL = `https://${LIVE_PROJECT_REF}.supabase.co`;
  assert.throws(() => assertE2ESupabaseTarget(env), /NEXT_PUBLIC_SUPABASE_URL must target the dedicated E2E project/);
});

test('rejects the live project ref and API URL', () => {
  const badRef = goodEnv();
  badRef.E2E_SUPABASE_PROJECT_REF = LIVE_PROJECT_REF;
  assert.throws(() => assertE2ESupabaseTarget(badRef), /Refusing E2E database access/);

  const badUrl = goodEnv();
  badUrl.E2E_SUPABASE_URL = `https://${LIVE_PROJECT_REF}.supabase.co`;
  assert.throws(() => assertE2ESupabaseTarget(badUrl), /Refusing E2E API access/);
});

test('rejects a database connection string that points to another Supabase project', () => {
  const env = goodEnv();
  env.E2E_SUPABASE_DB_URL = `postgresql://postgres.${LIVE_PROJECT_REF}:not-a-real-password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
  assert.throws(() => assertE2ESupabaseTarget(env), /Refusing E2E migration access/);
});

test('rejects project-bound JWT keys copied from the live project', () => {
  const env = goodEnv();
  env.E2E_SUPABASE_SERVICE_ROLE_KEY = jwt(LIVE_PROJECT_REF);
  assert.throws(() => assertE2ESupabaseTarget(env), /E2E_SUPABASE_SERVICE_ROLE_KEY belongs to a different/);
});

test('rejects legacy production credentials in the E2E process environment', () => {
  const env = goodEnv();
  env.SUPABASE_SERVICE_ROLE_KEY = jwt(LIVE_PROJECT_REF);
  assert.throws(() => assertE2ESupabaseTarget(env), /legacy production Supabase credentials/);
});

test('the Playwright workflow has no live-project fallback', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const start = workflow.indexOf('  playwright-e2e:\n');
  const end = workflow.indexOf('  # Manual dispatch only', start);
  assert.notEqual(start, -1, 'Playwright E2E job exists');
  assert.notEqual(end, -1, 'Playwright E2E job ends before workflow dispatch jobs');
  const job = workflow.slice(start, end);

  assert.doesNotMatch(job, new RegExp(LIVE_PROJECT_REF));
  assert.match(job, new RegExp(`E2E_SUPABASE_PROJECT_REF: ${E2E_PROJECT_REF}`));
  assert.match(job, /vars\.E2E_SUPABASE_URL/);
  assert.match(job, /secrets\.E2E_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(job, /supabase --workdir .* db push/);
  assert.match(job, /node scripts\/seed-e2e-supabase\.mjs/);
  assert.match(job, /node scripts\/cleanup-e2e-supabase\.mjs/);
  assert.match(job, /group: e2e-isolated\n\s+cancel-in-progress: false/);
  assert.match(job, /E2E_USER_EMAIL: e2e-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}@example\.invalid/);
  assert.match(job, /E2E_SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.E2E_SUPABASE_SERVICE_ROLE_KEY \}\}/);
  assert.doesNotMatch(job, /secrets\.E2E_USER_EMAIL|secrets\.NEXT_PUBLIC_SUPABASE_URL|secrets\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(job, /^\s+SUPABASE_SERVICE_ROLE_KEY:/m);
});

test('the live schema check is absent on PR builds and runs only on main push, schedule, or dispatch', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const buildStart = workflow.indexOf('  build-and-offline-evals:\n');
  const liveStart = workflow.indexOf('  live-schema-check:\n');
  const e2eStart = workflow.indexOf('  playwright-e2e:\n');
  assert.ok(buildStart >= 0 && liveStart > buildStart && e2eStart > liveStart);
  const build = workflow.slice(buildStart, liveStart);
  const live = workflow.slice(liveStart, e2eStart);
  assert.doesNotMatch(build, /check:live-schema/);
  assert.match(live, /github\.event_name == 'push'.*refs\/heads\/main/);
  assert.match(live, /github\.event_name == 'schedule'/);
  assert.match(live, /github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(live, new RegExp(LIVE_PROJECT_REF));
  assert.doesNotMatch(live, /https:\/\//);
  assert.equal((workflow.match(/npm run check:live-schema/g) ?? []).length, 1);

  const rlsStart = workflow.indexOf('  rls-isolation:\n');
  const rls = workflow.slice(rlsStart);
  assert.match(rls, /github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(rls, /github\.event_name == 'schedule'|github\.event_name == 'pull_request'/);
});

test('the live-schema script has no app-URL fallback', () => {
  const script = readFileSync(new URL('../../scripts/check-live-schema.mjs', import.meta.url), 'utf8');
  assert.match(script, /const url = process\.env\.SUPABASE_LIVE_URL;/);
  assert.doesNotMatch(script, /NEXT_PUBLIC_SUPABASE_URL/);
});

test('Supabase CLI action uses the Node 24-compatible composite v3 release', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /uses: supabase\/setup-cli@v3/);
  assert.doesNotMatch(workflow, /uses: supabase\/setup-cli@v[12]/);
  assert.match(workflow, /version: 3\.2\.0/);
});
