import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  assertE2ESupabaseApiTarget,
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

test('RLS API checks require dedicated E2E credentials and fail closed on production credentials', () => {
  const env = goodEnv();
  assert.deepEqual(assertE2ESupabaseApiTarget(env), {
    projectRef: E2E_PROJECT_REF,
    projectUrl: E2E_PROJECT_URL,
    anonKey: env.E2E_SUPABASE_ANON_KEY,
    serviceRoleKey: env.E2E_SUPABASE_SERVICE_ROLE_KEY,
  });

  const missing = { ...env };
  delete missing.E2E_SUPABASE_SERVICE_ROLE_KEY;
  assert.throws(() => assertE2ESupabaseApiTarget(missing), /Missing required E2E configuration: E2E_SUPABASE_SERVICE_ROLE_KEY/);

  const unsafe = { ...env, SUPABASE_SERVICE_ROLE_KEY: jwt(LIVE_PROJECT_REF) };
  assert.throws(() => assertE2ESupabaseApiTarget(unsafe), /legacy production Supabase credentials/);
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

test('database reset guard accepts exact direct and pooler tenants only', () => {
  const direct = goodEnv();
  direct.E2E_SUPABASE_DB_URL = `postgresql://postgres:not-a-real-password@db.${E2E_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`;
  assert.doesNotThrow(() => assertE2ESupabaseTarget(direct));
  for (const url of [
    `postgresql://postgres.${E2E_PROJECT_REF}:pw@db.other-project.supabase.co:5432/postgres`,
    `postgresql://postgres.${E2E_PROJECT_REF}:pw@attacker.example:5432/postgres`,
    `postgresql://postgres.${E2E_PROJECT_REF}-extra:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${E2E_PROJECT_REF}:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?host=db.other-project.supabase.co`,
    `postgresql://postgres.${E2E_PROJECT_REF}:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?user=postgres.other-project`,
    `postgresql://postgres.${E2E_PROJECT_REF}:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=disable`,
    `postgresql://postgres.${E2E_PROJECT_REF}:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
    `https://postgres.${E2E_PROJECT_REF}:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
  ]) {
    const env = goodEnv(); env.E2E_SUPABASE_DB_URL = url;
    assert.throws(() => assertE2ESupabaseTarget(env), /Refusing E2E migration access/, url);
  }
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

  // The speaking browser fixtures call the same fail-closed API guard inside
  // the test process, not just in the preceding workflow verification step.
  const testStepStart = job.indexOf('      - name: Run Playwright E2E tests\n');
  const testStepEnd = job.indexOf('      # Keep schema rebuild', testStepStart);
  assert.ok(testStepStart >= 0 && testStepEnd > testStepStart);
  const testStep = job.slice(testStepStart, testStepEnd);
  assert.match(testStep, new RegExp(`E2E_SUPABASE_PROJECT_REF: ${E2E_PROJECT_REF}`));
  assert.match(testStep, /E2E_TAG_TEST_USERS: 'true'/);
  assert.match(testStep, /E2E_SUPABASE_URL: \$\{\{ vars\.E2E_SUPABASE_URL \}\}/);
  assert.match(testStep, /E2E_SUPABASE_ANON_KEY: \$\{\{ vars\.E2E_SUPABASE_ANON_KEY \}\}/);
  assert.match(testStep, /E2E_SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.E2E_SUPABASE_SERVICE_ROLE_KEY \}\}/);
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

  assert.doesNotMatch(workflow, /production-(?:ai|placement|issue)-test:/);
  assert.doesNotMatch(workflow, /ebzmkhrssgnzmixfsuso/);
  assert.equal((workflow.match(/secrets\.SUPABASE_SERVICE_ROLE_KEY/g) ?? []).length, 0, 'CI jobs never receive the production service-role key');
  assert.match(live, /SUPABASE_LIVE_ANON_KEY/);
  assert.doesNotMatch(live, /SUPABASE_SERVICE_ROLE_KEY/);
  for (const script of ['test-ai-limits.mjs', 'test-issue-alert-grouping.mjs', 'test-rls.mjs']) {
    const content = readFileSync(new URL(`../../scripts/${script}`, import.meta.url), 'utf8');
    assert.match(content, /assertE2ESupabaseApiTarget\(\)/, `${script} validates the isolated target`);
    assert.doesNotMatch(content, /ebzmkhrssgnzmixfsuso|process\.env\.SUPABASE_SERVICE_ROLE_KEY|process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  }
});

test('RLS and real Storage tests run under the same lock as the rebuilt E2E schema', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const e2eStart = workflow.indexOf('  playwright-e2e:\n');
  const e2eEnd = workflow.indexOf('  # Manual dispatch only', e2eStart);
  const rlsStart = workflow.indexOf('  rls-isolation:\n');
  assert.ok(e2eStart >= 0 && e2eEnd > e2eStart && rlsStart > e2eEnd);
  const e2e = workflow.slice(e2eStart, e2eEnd);
  const rls = workflow.slice(rlsStart);
  assert.match(e2e, /group: e2e-isolated\n\s+cancel-in-progress: false/);
  const rebuild = e2e.indexOf('Apply repository migrations to the isolated E2E project');
  const browser = e2e.indexOf('Run Playwright E2E tests');
  const cleanup = e2e.indexOf('Delete this run\'s isolated E2E learner');
  assert.ok(rebuild >= 0 && browser > rebuild && cleanup > browser);
  for (const script of ['test-ai-limits.mjs', 'test-issue-alert-grouping.mjs', 'test-rls.mjs']) {
    const position = e2e.indexOf(`run: node scripts/${script}`);
    assert.ok(position > browser && position < cleanup, `${script} must run before cleanup without releasing the lock`);
    const stepStart = e2e.lastIndexOf('      - name:', position);
    const step = e2e.slice(stepStart, position);
    assert.match(step, new RegExp(`E2E_SUPABASE_PROJECT_REF: ${E2E_PROJECT_REF}`));
    assert.match(step, /vars\.E2E_SUPABASE_URL/);
    assert.match(step, /vars\.E2E_SUPABASE_ANON_KEY/);
    assert.match(step, /secrets\.E2E_SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(step, /E2E_TAG_TEST_USERS: 'true'/);
    assert.match(step, /E2E_RUN_ID: \$\{\{ github\.run_id \}\}/);
    assert.match(step, /E2E_RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/);
  }
  // Preserve the required check, but do not reacquire the shared schema in a
  // second job where a different run may have reset it in the meantime.
  assert.match(rls, /^    if: always\(\)$/m);
  assert.match(rls, /^    needs: playwright-e2e$/m);
  assert.match(rls, /E2E_RESULT: \$\{\{ needs\.playwright-e2e\.result \}\}/);
  assert.doesNotMatch(rls, /node scripts\/test-|SUPABASE_|group: e2e-isolated|continue-on-error/);

  // Run the actual shell gate from the workflow, not an approximation of it.
  // GitHub's always() schedules the job after a failed/skipped/cancelled
  // prerequisite; the gate must explicitly fail for every non-success result.
  const command = rls.match(/        run: \|\n((?: {10}[^\n]*\n?)+)/)?.[1]?.replace(/^ {10}/gm, '');
  assert.ok(command, 'required-check gate has a shell command');
  for (const result of ['success', 'failure', 'cancelled', 'skipped', '', 'unknown']) {
    const gate = spawnSync('bash', ['-eo', 'pipefail', '-c', command], { env: { ...process.env, E2E_RESULT: result }, encoding: 'utf8' });
    assert.equal(gate.status === 0, result === 'success', `required-check result ${JSON.stringify(result)}: ${gate.stdout} ${gate.stderr}`);
  }
});

test('the live-schema script has no app-URL fallback', () => {
  const script = readFileSync(new URL('../../scripts/check-live-schema.mjs', import.meta.url), 'utf8');
  assert.match(script, /const url = process\.env\.SUPABASE_LIVE_URL;/);
  assert.match(script, /const apiKey = process\.env\.SUPABASE_LIVE_ANON_KEY;/);
  assert.doesNotMatch(script, /NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/);
});

test('Supabase CLI action uses the Node 24-compatible composite v3 release', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /uses: supabase\/setup-cli@v3/);
  assert.doesNotMatch(workflow, /uses: supabase\/setup-cli@v[12]/);
  assert.match(workflow, /version: 3\.2\.0/);
});
