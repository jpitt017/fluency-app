import { randomBytes } from 'node:crypto';

/** Identify fixtures from one isolated GitHub Actions run and attempt. */
export function e2eFixtureScope(env) {
  const runId = env.E2E_RUN_ID;
  const runAttempt = env.E2E_RUN_ATTEMPT;
  if (!/^[a-z0-9-]{1,24}$/i.test(runId ?? '') || !/^[1-9][0-9]{0,3}$/.test(runAttempt ?? '')) {
    throw new Error('Invalid isolated E2E fixture run or attempt');
  }
  return { runId, runAttempt, emailPrefix: `e2e-fixture-${runId}-${runAttempt}-`.toLowerCase() };
}

export function newE2EFixtureEmail(scope) {
  return `${scope.emailPrefix}${Date.now()}-${randomBytes(4).toString('hex')}@example.test`;
}

/** Require both the run-scoped address and server-controlled app metadata. */
export function isE2EFixture(user, scope) {
  const email = typeof user?.email === 'string' ? user.email.toLowerCase() : '';
  if (!email.startsWith(scope.emailPrefix)) return false;
  const suffix = email.slice(scope.emailPrefix.length);
  return /^[0-9]{13}-[0-9a-f]{8}@example\.test$/.test(suffix)
    && user.app_metadata?.arena_e2e_fixture === true
    && user.app_metadata?.arena_e2e_run_id === scope.runId
    && user.app_metadata?.arena_e2e_run_attempt === scope.runAttempt;
}
