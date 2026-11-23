import test from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_WINDOW_MINUTES, sendProviderFailureAlert } from '../../lib/b1b2/provider-alert.ts';

/**
 * The sender is the risky half: it runs inside a learner's failed request and
 * must never throw, never email more than once per incident window, and never
 * put a learner's data in the message.
 *
 * `sendProviderFailureAlert` takes `fetchImpl`, so these tests never touch the
 * network. Like the issue-email test, it must run with
 * `--conditions=react-server`, which resolves `server-only` to its empty
 * production export; without it the marker package throws by design.
 */

function authError() {
  const error = new Error('401 Invalid API Key');
  error.name = 'APIError';
  error.status = 401;
  error.error = { error: { message: 'Invalid API Key', code: 'invalid_api_key' } };
  return error;
}

/** An admin whose RPC answers with whatever the test wants. */
function fakeAdmin(answers) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      const next = answers.length > 1 ? answers.shift() : answers[0];
      return next instanceof Error ? { data: null, error: { message: next.message } } : { data: next, error: null };
    },
  };
}

function withEnv(fn) {
  const saved = { ...process.env };
  const oldFetch = globalThis.fetch;
  return async () => {
    try {
      Object.assign(process.env, {
        RESEND_API_KEY: 'test-key',
        ISSUE_EMAIL_FROM: 'sender@example.test',
        ISSUE_ADMIN_EMAIL: 'admin@example.test',
        ISSUE_APP_URL: 'https://example.test',
      });
      return await fn();
    } finally {
      process.env = saved;
      globalThis.fetch = oldFetch;
    }
  };
}

test('a 401 sends one email, with no learner data and a hashed grouping key', withEnv(async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  };
  const admin = fakeAdmin([true]);

  assert.equal(
    await sendProviderFailureAlert({ admin, endpoint: '/api/writing/correct', model: 'openai/gpt-oss-20b', error: authError(), fetchImpl }),
    true,
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.resend.com/emails');
  const payload = JSON.parse(requests[0].options.body);
  assert.match(payload.subject, /AI key rejected/);
  assert.match(payload.text, /Invalid API Key/);

  // The claim key is a 64-char hex digest, and the endpoint is not in it.
  const claim = admin.calls[0];
  assert.equal(claim.name, 'claim_ai_failure_alert');
  assert.match(claim.args.p_group_key, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(claim.args.p_group_key, /writing/);
  assert.equal(claim.args.p_window_minutes, ALERT_WINDOW_MINUTES);
  assert.doesNotMatch(requests[0].options.headers['Idempotency-Key'], /writing|correct/);
}));

test('a second failure inside the window sends nothing', withEnv(async () => {
  let fetches = 0;
  const fetchImpl = async () => { fetches++; return { ok: true }; };
  // The gate says "already alerted" -> no mail at all.
  const admin = fakeAdmin([false]);

  assert.equal(
    await sendProviderFailureAlert({ admin, endpoint: '/api/writing/correct', error: authError(), fetchImpl }),
    false,
  );
  assert.equal(fetches, 0, 'a suppressed alert must not call Resend');
}));

test('a timeout is logged but not emailed', withEnv(async () => {
  let fetches = 0;
  const fetchImpl = async () => { fetches++; return { ok: true }; };
  const timeout = new Error('Request timed out.');
  timeout.name = 'APIConnectionTimeoutError';
  const admin = fakeAdmin([true]);

  assert.equal(await sendProviderFailureAlert({ admin, endpoint: '/api/chat', error: timeout, fetchImpl }), false);
  assert.equal(fetches, 0, 'a transient timeout must not wake anyone up');
  assert.equal(admin.calls.length, 0, 'and it must not even claim a window');
}));

test('a broken gate or a missing table still alerts once, and never throws', withEnv(async () => {
  // This is the pre-migration case: the RPC does not exist. Silence would be the
  // worst outcome, because a bad key means no learner gets feedback at all.
  let fetches = 0;
  const fetchImpl = async () => { fetches++; return { ok: true }; };
  const admin = fakeAdmin([new Error('function claim_ai_failure_alert does not exist')]);

  assert.equal(
    await sendProviderFailureAlert({ admin, endpoint: '/api/writing/correct', error: authError(), fetchImpl }),
    true,
  );
  assert.equal(fetches, 1);
}));

test('an unreachable mail provider is reported, never thrown', withEnv(async () => {
  const fetchImpl = async () => { throw new Error('connect ECONNREFUSED'); };
  // The learner's request must still return its own error, so no rejection.
  assert.equal(
    await sendProviderFailureAlert({ admin: fakeAdmin([true]), endpoint: '/api/x', error: authError(), fetchImpl }),
    false,
  );

  const notOk = async () => ({ ok: false, status: 503 });
  assert.equal(
    await sendProviderFailureAlert({ admin: fakeAdmin([true]), endpoint: '/api/x', error: authError(), fetchImpl: notOk }),
    false,
  );
}));

test('without mail settings it logs and stays quiet', withEnv(async () => {
  delete process.env.RESEND_API_KEY;
  let fetches = 0;
  const fetchImpl = async () => { fetches++; return { ok: true }; };
  assert.equal(
    await sendProviderFailureAlert({ admin: fakeAdmin([true]), endpoint: '/api/x', error: authError(), fetchImpl }),
    false,
  );
  assert.equal(fetches, 0);
}));

test('no admin client still alerts, since the failure is real', withEnv(async () => {
  let fetches = 0;
  const fetchImpl = async () => { fetches++; return { ok: true }; };
  assert.equal(
    await sendProviderFailureAlert({ admin: null, endpoint: '/api/x', error: authError(), fetchImpl }),
    true,
  );
  assert.equal(fetches, 1);
}));
