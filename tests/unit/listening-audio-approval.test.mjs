import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALLOW_PROD_RELEASE_ENV,
  APPROVAL_MODES,
  PRODUCTION_PROJECT_REF,
  checkApprovalTarget,
  isApprovalBypassRequested,
  isProductionUrl,
  projectRefFromUrl,
} from '../../scripts/lib/course-audio/environment.mjs';
import { releaseTrial, revokeTrial } from '../../scripts/lib/course-audio/publish.mjs';

/**
 * The standing rule these tests protect: a week is never marked released on
 * production, not even briefly for a test. Approval behaviour is exercised with
 * a fake client only — no project is contacted anywhere in this file.
 *
 * Every production-refusal test passes `allowProductionRelease: false`
 * explicitly, because the shipped default reads `ALLOW_PRODUCTION_RELEASE` from
 * the environment. A CI job that exported it job-wide (as the course-audio
 * workflow used to) turned these assertions into pass-throughs and the suite
 * failed with "Missing expected rejection". Pinning the argument keeps the rule
 * true no matter what the surrounding shell exported; a separate test below
 * checks that the ambient-variable path still works when it is meant to.
 */

const PROD = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const PREVIEW = 'https://abcdefghijklmnopqrst.supabase.co';

/** Fake Supabase client that records writes instead of performing them. */
function fakeClient({ url, failWith = null } = {}) {
  const writes = [];
  return {
    writes,
    ...(url ? { supabaseUrl: url } : {}),
    from(table) {
      assert.equal(table, 'listening_audio_trials');
      return {
        update(values) {
          return {
            eq: async (column, value) => {
              if (failWith) return { error: failWith };
              writes.push({ values, column, value });
              return { error: null };
            },
          };
        },
      };
    },
  };
}

const releaseArgs = (client, extra = {}) => ({
  client,
  week: 1,
  audioUrl: 'https://example.supabase.co/storage/v1/object/public/course-audio/weeks-01-04/ai-trial/week-1-listening.mp3',
  captionsUrl: null,
  releasedAt: '2026-11-22T10:00:00.000Z',
  ...extra,
});

test('the production project ref is recognised, including from a trailing path', () => {
  assert.equal(projectRefFromUrl(PROD), PRODUCTION_PROJECT_REF);
  assert.equal(projectRefFromUrl(`${PROD}/`), PRODUCTION_PROJECT_REF);
  assert.equal(projectRefFromUrl(`HTTPS://${PRODUCTION_PROJECT_REF.toUpperCase()}.SUPABASE.CO`), PRODUCTION_PROJECT_REF);
  assert.equal(isProductionUrl(PROD), true);
  assert.equal(isProductionUrl(PREVIEW), false);
});

test('a local stack and junk URLs are never mistaken for production', () => {
  assert.equal(projectRefFromUrl('http://127.0.0.1:54321'), 'local');
  assert.equal(projectRefFromUrl('http://localhost:54321'), 'local');
  assert.equal(isProductionUrl('http://127.0.0.1:54321'), false);
  assert.equal(projectRefFromUrl('not a url'), null);
  assert.equal(projectRefFromUrl('https://example.com'), null);
  assert.equal(projectRefFromUrl(''), null);
  assert.equal(projectRefFromUrl(undefined), null);
  assert.equal(isProductionUrl('https://example.com'), false);
});

test('release refuses production, and says why', () => {
  // Spelled out even though this function already defaults bypass to false: the
  // point of the test is a refusal, so it should not depend on a default.
  const verdict = checkApprovalTarget({ url: PROD, bypass: false });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.production, true);
  assert.match(verdict.reason, /Refusing to change approval state on production/);
  assert.match(verdict.reason, /never be marked released on production, not even briefly for a test/);
  assert.match(verdict.reason, /preview\/branch database/);
});

test('release refuses an unknown or missing project rather than guessing', () => {
  for (const url of [undefined, '', 'not a url', 'https://example.com']) {
    const verdict = checkApprovalTarget({ url });
    assert.equal(verdict.ok, false, `expected a refusal for ${String(url)}`);
    assert.match(verdict.reason, /missing or is not a Supabase URL/);
  }
});

test('a non-production project is allowed', () => {
  const verdict = checkApprovalTarget({ url: PREVIEW });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.ref, 'abcdefghijklmnopqrst');
  assert.equal(verdict.production, undefined);
});

test('the bypass is opt-in only: 1 or true, nothing else', () => {
  assert.equal(isApprovalBypassRequested({ [ALLOW_PROD_RELEASE_ENV]: '1' }), true);
  assert.equal(isApprovalBypassRequested({ [ALLOW_PROD_RELEASE_ENV]: 'true' }), true);
  for (const value of ['0', 'false', 'yes', '', undefined, 'TRUE']) {
    assert.equal(isApprovalBypassRequested({ [ALLOW_PROD_RELEASE_ENV]: value }), false);
  }
  assert.equal(checkApprovalTarget({ url: PROD, bypass: true }).ok, true);
});

test('releaseTrial makes no write at all against production', async () => {
  const client = fakeClient({ url: PROD });
  await assert.rejects(
    releaseTrial(releaseArgs(client, { allowProductionRelease: false })),
    /Refusing to change approval state on production/,
  );
  assert.deepEqual(client.writes, [], 'a refused release must not touch the table');
});

test('releaseTrial reads the URL from the client, and from an explicit override', async () => {
  const viaClient = fakeClient({ url: PROD });
  await assert.rejects(releaseTrial(releaseArgs(viaClient, { allowProductionRelease: false })), /production/);
  assert.deepEqual(viaClient.writes, []);

  // A preview-targeted client can also be handed a production URL explicitly.
  const viaOverride = fakeClient({ url: PREVIEW });
  await assert.rejects(
    releaseTrial(releaseArgs(viaOverride, { url: PROD, allowProductionRelease: false })),
    /production/,
  );
  assert.deepEqual(viaOverride.writes, []);
});

test('releaseTrial writes the approval only on a preview project', async () => {
  const client = fakeClient({ url: PREVIEW });
  await releaseTrial(releaseArgs(client));
  assert.equal(client.writes.length, 1);
  assert.equal(client.writes[0].values.released, true);
  assert.equal(client.writes[0].values.released_at, '2026-11-22T10:00:00.000Z');
  assert.deepEqual({ column: client.writes[0].column, value: client.writes[0].value }, { column: 'week', value: 1 });
});

test('a fake week number is a valid rehearsal target, not a production release', async () => {
  // The rehearsal the docs recommend: release week 31 on a preview project.
  const client = fakeClient({ url: PREVIEW });
  await releaseTrial(releaseArgs(client, { week: 31 }));
  assert.equal(client.writes[0].values.released, true);
  assert.equal(client.writes[0].value, 31);
});

test('revokeTrial carries the same production refusal', async () => {
  const blocked = fakeClient({ url: PROD });
  await assert.rejects(
    revokeTrial({ client: blocked, week: 1, allowProductionRelease: false }),
    /Refusing to change approval state on production/,
  );
  assert.deepEqual(blocked.writes, []);

  const allowed = fakeClient({ url: PREVIEW });
  await revokeTrial({ client: allowed, week: 1 });
  assert.deepEqual(allowed.writes[0].values, { released: false, audio_url: null, released_at: null });
});

test('the bypass is the only way through on production, and still writes', async () => {
  const client = fakeClient({ url: PROD });
  await releaseTrial(releaseArgs(client, { allowProductionRelease: true }));
  assert.equal(client.writes[0].values.released, true);
});

test('a database error on a preview project is still reported', async () => {
  const client = fakeClient({ url: PREVIEW, failWith: { message: 'week not found' } });
  await assert.rejects(releaseTrial(releaseArgs(client)), /Could not release week 1/);
});

test('the CLI exposes no unguarded release path', () => {
  const cli = readFileSync(new URL('../../scripts/generate-course-audio.mjs', import.meta.url), 'utf8');
  // Release and revoke both go through publish.mjs, which owns the guard.
  assert.match(cli, /await releaseTrial\(\{/);
  assert.match(cli, /await revokeTrial\(\{/);
  assert.doesNotMatch(cli, /\.update\(\s*\{\s*released: true/);
  assert.doesNotMatch(cli, /released:\s*true/);
});

test('the CLI checks the target before it reads anything from the database', () => {
  const cli = readFileSync(new URL('../../scripts/generate-course-audio.mjs', import.meta.url), 'utf8');
  const releaseBody = cli.slice(cli.indexOf('async function releaseWeek('), cli.indexOf('async function revokeWeek('));
  const revokeBody = cli.slice(cli.indexOf('async function revokeWeek('), cli.indexOf('/**\n * Argument parsing lives inside'));
  for (const [name, body] of [['releaseWeek', releaseBody], ['revokeWeek', revokeBody]]) {
    assert.ok(body.length > 0, `${name} must exist`);
    const guardAt = body.indexOf('checkApprovalTarget(');
    const clientAt = body.indexOf('requireSupabase()');
    assert.ok(guardAt > -1, `${name} must call checkApprovalTarget`);
    assert.ok(guardAt < clientAt, `${name} must refuse production before doing any database work`);
  }
});

test('the CLI passes the workflow bypass to the target check, so a two-keyed run can proceed', () => {
  const cli = readFileSync(new URL('../../scripts/generate-course-audio.mjs', import.meta.url), 'utf8');
  // Regression: the guard was called without `bypass`, which made the documented
  // escape hatch dead - a correct two-key release was refused on production.
  for (const fn of ['releaseWeek', 'revokeWeek']) {
    const start = cli.indexOf(`async function ${fn}(`);
    const body = cli.slice(start, cli.indexOf('\n}\n', start));
    assert.match(body, /checkApprovalTarget\(\{ url: supabaseUrl, bypass: isApprovalBypassRequested\(\) \}\)/, `${fn} must honour the bypass`);
  }
});

test('the workflow cannot release on production without an explicit override', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/course-audio.yml', import.meta.url), 'utf8');
  assert.match(workflow, /allow_production_release:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /production_ack:/);
  assert.match(workflow, /Refuse an unacknowledged approval write on production/);
  assert.match(workflow, /ALLOW_PRODUCTION_RELEASE: \$\{\{ inputs\.allow_production_release && inputs\.production_ack == 'release to learners' && '1' \|\| '' \}\}/);
  // Both the checkbox and the phrase are needed, so a stray tick cannot release.
  assert.match(workflow, /inputs\.production_ack != 'release to learners'/);
});

test('the approval modes list matches the workflow modes', () => {
  assert.deepEqual(APPROVAL_MODES, ['release', 'revoke']);
  const workflow = readFileSync(new URL('../../.github/workflows/course-audio.yml', import.meta.url), 'utf8');
  for (const mode of APPROVAL_MODES) {
    assert.match(workflow, new RegExp(`inputs\\.mode == '${mode}'`));
  }
});

test('both documents carry the rule', () => {
  const agents = readFileSync(new URL('../../AGENTS.md', import.meta.url), 'utf8');
  const pipeline = readFileSync(new URL('../../docs/CONTENT_PIPELINE.md', import.meta.url), 'utf8');
  for (const [name, text] of [['AGENTS.md', agents], ['docs/CONTENT_PIPELINE.md', pipeline]]) {
    assert.match(text, /never (be )?marked `?released`? on (the )?production/i, `${name} must state the rule`);
    assert.match(text, /not (even briefly|for a test|for a moment)/i, `${name} must say "not even briefly"`);
    assert.match(text, /preview/i, `${name} must point at a preview database`);
    assert.match(text, /fake week number/i, `${name} must offer the fake-week escape hatch`);
    assert.match(text, /unit test/i, `${name} must point at unit tests`);
  }
});

/**
 * A child process that exercises the real guard, once per value of the variable.
 *
 * Spawned rather than inlined because `isApprovalBypassRequested()` reads
 * `process.env` at call time and the shipped default is the ambient value; only
 * a separate process can see a different environment. The child imports the real
 * modules, so this checks the behaviour, not the source text.
 *
 * This is the regression that broke run 45258656177: the workflow exported
 * ALLOW_PRODUCTION_RELEASE job-wide, so the three "production must be refused"
 * tests saw a bypass and failed with "Missing expected rejection". The assertions
 * above are pinned to an explicit argument, which fixes the symptom; this test
 * fixes the cause by checking the rule holds whatever the shell exported.
 *
 * Deliberately not the whole suites: they are 8 s together in CI but minutes in a
 * sandbox without network, and a 24-run matrix would be unusable. What must hold
 * is the guard's answer, which is exactly what the three failing tests asserted.
 */
const GUARD_PROBE = `
import assert from 'node:assert/strict';
import { releaseTrial, revokeTrial } from __PUBLISH_MODULE__;
import { isApprovalBypassRequested, PRODUCTION_PROJECT_REF } from __ENVIRONMENT_MODULE__;

/**
 * The invariant, for any value of ALLOW_PRODUCTION_RELEASE:
 *
 *  - an explicit allowProductionRelease:false always refuses production. That is
 *    the argument the tests in this file pass, so this is what makes them
 *    environment-proof. publish.mjs reads
 *    options.allowProductionRelease ?? isApprovalBypassRequested(), so an
 *    explicit false must win over a set variable.
 *  - a preview project is always allowed: the guard is not simply always-off.
 *
 * It deliberately does NOT assert that the default refuses: with the variable set
 * to 1/true the default is meant to allow, which is the deliberate-release path.
 */
const PROD = 'https://' + PRODUCTION_PROJECT_REF + '.supabase.co';
const writes = [];
const client = (url) => ({
  supabaseUrl: url,
  from: () => ({ update: (values) => ({ eq: async () => (writes.push(values), { error: null }) }) }),
});

const pinned = { client: client(PROD), week: 1, audioUrl: 'https://example.test/a.mp3', allowProductionRelease: false };
await assert.rejects(releaseTrial({ ...pinned }), /Refusing to change approval state on production/);
await assert.rejects(revokeTrial({ client: client(PROD), week: 1, allowProductionRelease: false }), /Refusing to change approval state on production/);
assert.deepEqual(writes, [], 'a refused write must never reach the table');

// The same refusal through the default path, but only when nothing grants a bypass.
if (!isApprovalBypassRequested()) {
  await assert.rejects(releaseTrial({ client: client(PROD), week: 1, audioUrl: 'https://example.test/a.mp3' }), /production/);
}

console.log(JSON.stringify({ ok: true, ambientBypass: isApprovalBypassRequested() }));
`;

test('a pinned refusal holds whatever ALLOW_PRODUCTION_RELEASE is set to', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');

  // The probe lives outside the repo and imports the modules by absolute URL, so
  // it never appears in the working tree: node --test collects *.test.mjs and
  // test-*.mjs from there, and a probe the runner collected would spawn copies of
  // the suite that spawned it. A killed test also cannot leave a stray file.
  const dir = mkdtempSync(join(tmpdir(), 'guard-probe-'));
  const probe = join(dir, 'probe.mjs');
  const at = (relative) => pathToFileURL(new URL(relative, import.meta.url).pathname).href;
  writeFileSync(
    probe,
    GUARD_PROBE.replace('__ENVIRONMENT_MODULE__', JSON.stringify(at('../../scripts/lib/course-audio/environment.mjs')))
      .replace('__PUBLISH_MODULE__', JSON.stringify(at('../../scripts/lib/course-audio/publish.mjs'))),
  );

  // NODE_TEST_CONTEXT makes a child that is itself treated as a test file print
  // "run() is being called recursively ... skipping running files" and exit 0
  // without running anything — a green tick for nothing.
  const baseEnv = { ...process.env };
  delete baseEnv.NODE_TEST_CONTEXT;

  const failures = [];
  try {
    for (const value of [undefined, '', '0', 'false', '1', 'true']) {
      const env = { ...baseEnv };
      if (value === undefined) delete env[ALLOW_PROD_RELEASE_ENV];
      else env[ALLOW_PROD_RELEASE_ENV] = value;

      const run = spawnSync(process.execPath, [probe], { env, encoding: 'utf8', timeout: 30_000 });
      const label = `${ALLOW_PROD_RELEASE_ENV}=${value === undefined ? '(unset)' : JSON.stringify(value)}`;
      const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;

      if (run.error) {
        failures.push(`${label}: could not run (${run.error.message})`);
        continue;
      }
      if (run.status !== 0) {
        failures.push(`${label}: exit ${run.status} ${output.split('\n').filter(Boolean).slice(-3).join(' / ')}`);
        continue;
      }
      // A real run ends with the probe's own JSON: silence is not success.
      if (!/"ok":true/.test(output)) failures.push(`${label}: the probe did not report success`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(failures, [], `The rule must hold for every value of the variable:\n${failures.join('\n')}`);
});

test('the audio test files never rely on ambient approval env for a refusal', () => {
  // The three failures came from asserting a refusal while the environment could
  // grant the bypass. Every refusal in these files must pin the argument.
  const files = [
    'tests/unit/listening-audio-approval.test.mjs',
    'tests/unit/listening-trial.test.mjs',
    'tests/unit/listening-audio-delete.test.mjs',
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const bodies = source.split(/\n(?=test\()/);
    for (const body of bodies) {
      // Skip this scan itself: it quotes the very pattern it looks for.
      if (/never rely on ambient approval env/.test(body)) continue;
      if (!/Refusing to change approval state on production|\/production\//.test(body)) continue;
      assert.match(
        body,
        /allowProductionRelease:\s*false|bypass:\s*false/,
        `${file}: a production-refusal assertion must not depend on the environment:\n${body.slice(0, 220)}`,
      );
    }
  }
});

test('the workflow keeps the release override off every other step', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/course-audio.yml', import.meta.url), 'utf8');
  const lines = workflow.split('\n');

  // No job-wide override: that is what leaked into the tests.
  const envBlockStart = lines.findIndex((line) => line === 'env:');
  assert.ok(envBlockStart >= 0, 'the workflow has a top-level env block');
  const jobWide = [];
  for (let i = envBlockStart + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i]) && lines[i].trim()) break;
    if (/^\s{2}\S/.test(lines[i])) jobWide.push(lines[i].trim());
  }
  assert.deepEqual(
    jobWide.filter((line) => /ALLOW_PRODUCTION_RELEASE|SERVICE_ROLE_KEY/.test(line)),
    [],
    'the release override and the service-role key must be step-scoped, not job-wide',
  );

  // And the override appears only on the approval steps. Split into steps
  // first: a greedy regex across the whole file would attribute one step's env
  // to every step before it.
  const steps = workflow.split(/\n\s{6}- name: /).slice(1);
  const overrideSteps = steps
    .filter((step) => /^\s*ALLOW_PRODUCTION_RELEASE:/m.test(step))
    .map((step) => step.split('\n')[0].trim());
  assert.deepEqual(overrideSteps.sort(), ['Release approved speaking clips', 'Release approved weeks', 'Revoke a track']);
});
