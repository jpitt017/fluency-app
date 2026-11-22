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
  const verdict = checkApprovalTarget({ url: PROD });
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
  await assert.rejects(releaseTrial(releaseArgs(client)), /Refusing to change approval state on production/);
  assert.deepEqual(client.writes, [], 'a refused release must not touch the table');
});

test('releaseTrial reads the URL from the client, and from an explicit override', async () => {
  const viaClient = fakeClient({ url: PROD });
  await assert.rejects(releaseTrial(releaseArgs(viaClient)), /production/);
  assert.deepEqual(viaClient.writes, []);

  // A preview-targeted client can also be handed a production URL explicitly.
  const viaOverride = fakeClient({ url: PREVIEW });
  await assert.rejects(releaseTrial(releaseArgs(viaOverride, { url: PROD })), /production/);
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
  await assert.rejects(revokeTrial({ client: blocked, week: 1 }), /Refusing to change approval state on production/);
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
