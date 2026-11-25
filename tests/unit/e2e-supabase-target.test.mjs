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
  E2E_USER_EMAIL: 'e2e@example.invalid',
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
  assert.doesNotMatch(job, /secrets\.NEXT_PUBLIC_SUPABASE_URL|secrets\.SUPABASE_SERVICE_ROLE_KEY/);
});
