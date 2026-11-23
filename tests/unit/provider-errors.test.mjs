import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALERTING_FAILURE_KINDS,
  PROVIDER_FAILURE_MESSAGES,
  classifyProviderFailure,
  describeProviderFailure,
  isDailyQuotaError,
  learnerFacingProviderError,
  providerErrorStatus,
  providerFailureHttpStatus,
  shouldAlertOnFailure,
} from '../../lib/b1b2/provider-errors.mjs';

/**
 * The provider's own words must never reach a learner. These tests use errors
 * shaped exactly like groq-sdk's APIError, so the classifier is exercised against
 * what the SDK really throws rather than a convenient invention.
 */

/** Mirrors groq-sdk's APIError: status, parsed body on `.error`, a message. */
function apiError(status, body, message = `${status}: ${JSON.stringify(body)}`) {
  const error = new Error(message);
  error.name = 'APIError';
  error.status = status;
  error.error = body;
  error.headers = new Headers();
  return error;
}

/** Mirrors APIConnectionTimeoutError: no status at all. */
function timeoutError(message = 'Request timed out.') {
  const error = new Error(message);
  error.name = 'APIConnectionTimeoutError';
  return error;
}

const GROQ_AUTH_401 = {
  error: {
    message: 'Invalid API Key',
    type: 'invalid_request_error',
    code: 'invalid_api_key',
  },
};
const GROQ_RATE_429 = {
  error: {
    message: 'Rate limit reached for model `openai/gpt-oss-20b` in organization `org_01ABC` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 7990, Requested 500.',
    type: 'tokens',
    code: 'rate_limit_exceeded',
  },
};
const GROQ_DAILY_429 = {
  error: {
    message: 'Rate limit reached for model `openai/gpt-oss-20b` in organization `org_01ABC` on tokens per day (TPD): Limit 200000, Used 200000, Requested 500. Please try again in 2h.',
    type: 'tokens',
    code: 'rate_limit_exceeded',
  },
};

test('a fake 401 is a configuration fault, not the learner\u2019s problem', () => {
  const error = apiError(401, GROQ_AUTH_401);
  assert.equal(providerErrorStatus(error), 401);
  assert.equal(classifyProviderFailure(error), 'auth');
  assert.equal(shouldAlertOnFailure('auth'), true);
  // A 503, never a 401: the learner's own session is fine, and echoing 401 would
  // make the client look signed out.
  assert.equal(providerFailureHttpStatus(error), 503);

  const learner = learnerFacingProviderError(error, { workSaved: false });
  assert.equal(learner.message, "Feedback isn't working right now. Please copy your text before you try again.");
  assert.equal(learner.code, 'ai_unavailable');
  assert.equal(learner.workSaved, false);
});

test('a fake 401 while the work is saved says so', () => {
  const learner = learnerFacingProviderError(apiError(401, GROQ_AUTH_401), { workSaved: true });
  assert.equal(learner.message, "Feedback isn't working right now. Your work is saved. Please try again later.");
  assert.equal(learner.code, 'ai_unavailable_saved');
});

test('a fake 429 rate limit is retryable and alerts', () => {
  const error = apiError(429, GROQ_RATE_429);
  assert.equal(isDailyQuotaError(error), false, 'a per-minute limit is not the daily one');
  assert.equal(classifyProviderFailure(error), 'rate-limit');
  assert.equal(shouldAlertOnFailure('rate-limit'), true);
  assert.equal(providerFailureHttpStatus(error), 429);

  // A rate limit clears on its own, so the normal retry wording applies.
  const learner = learnerFacingProviderError(error, { workSaved: false });
  assert.equal(learner.message, PROVIDER_FAILURE_MESSAGES.unsaved);
});

test('the daily token quota (a 429 TPD) tells the learner to come back tomorrow', () => {
  const error = apiError(429, GROQ_DAILY_429);
  assert.equal(isDailyQuotaError(error), true);
  assert.equal(classifyProviderFailure(error), 'daily-quota');
  assert.equal(shouldAlertOnFailure('daily-quota'), true);
  assert.equal(learnerFacingProviderError(error, { workSaved: false }).message, 'Feedback has stopped for today. Please try again tomorrow.');

  // The daily message wins even when the work happens to be saved: retrying today
  // cannot work, so offering "try again later" would be a pointless loop.
  const saved = learnerFacingProviderError(error, { workSaved: true });
  assert.equal(saved.message, 'Feedback has stopped for today. Please try again tomorrow.');
  assert.equal(saved.code, 'ai_daily_quota');

  // A TPD phrasing with no `TPD` token is still recognised by its words.
  assert.equal(
    isDailyQuotaError(apiError(429, { error: { message: 'You have exceeded your daily quota of tokens per day.' } })),
    true,
  );
});

test('a timeout is not a quota fault and does not alert', () => {
  const error = timeoutError();
  assert.equal(providerErrorStatus(error), null);
  assert.equal(classifyProviderFailure(error), 'timeout');
  assert.equal(shouldAlertOnFailure('timeout'), false);
  assert.equal(providerFailureHttpStatus(error), 503);
  assert.equal(
    learnerFacingProviderError(error, { workSaved: false }).message,
    "Feedback isn't working right now. Please copy your text before you try again.",
  );

  // undici's abort shape has no name, only the message.
  const aborted = new Error('The operation was aborted due to timeout');
  assert.equal(classifyProviderFailure(aborted), 'timeout');
});

test('only the faults a learner cannot retry away are alerted', () => {
  assert.deepEqual([...ALERTING_FAILURE_KINDS].sort(), ['auth', 'daily-quota', 'rate-limit']);
  for (const error of [apiError(401, GROQ_AUTH_401), apiError(429, GROQ_RATE_429), apiError(429, GROQ_DAILY_429)]) {
    assert.equal(shouldAlertOnFailure(classifyProviderFailure(error)), true);
  }
  // An ordinary 500 is logged but not emailed: it is usually one bad request.
  assert.equal(shouldAlertOnFailure(classifyProviderFailure(apiError(500, { error: { message: 'boom' } }))), false);
});

test('the learner message never contains the provider text', () => {
  const errors = [
    apiError(401, GROQ_AUTH_401),
    apiError(429, GROQ_RATE_429),
    apiError(429, GROQ_DAILY_429),
    timeoutError(),
    apiError(400, { error: { message: 'model `openai/gpt-oss-20b` failed json_validate_failed' } }),
  ];
  for (const error of errors) {
    for (const workSaved of [true, false]) {
      for (const workKind of ['text', 'recording']) {
        const { message } = learnerFacingProviderError(error, { workSaved, workKind });
        assert.doesNotMatch(message, /groq|openai|org_|rate limit|invalid api key|token|model|json|TPD|401|429|500/i, message);
        // Every message is two or three short sentences at most.
        assert.ok(message.length < 120, message);
      }
    }
  }
});

test('the recording wording is used only for recordings', () => {
  const error = apiError(429, GROQ_RATE_429);
  assert.equal(
    learnerFacingProviderError(error, { workSaved: false, workKind: 'recording' }).message,
    "Feedback isn't working right now. Your recording isn't saved. Please try again later.",
  );
  assert.match(learnerFacingProviderError(error, { workSaved: false, workKind: 'text' }).message, /copy your text/);
});

test('the server log keeps the detail the learner must not see', () => {
  const described = describeProviderFailure(apiError(401, GROQ_AUTH_401), {
    endpoint: '/api/writing/correct',
    model: 'openai/gpt-oss-20b',
  });
  assert.match(described, /^\[ai:auth\] status=401/);
  assert.match(described, /openai\/gpt-oss-20b/);
  assert.match(described, /Invalid API Key/);

  // Newlines are flattened so a provider body cannot forge extra log lines.
  const multiline = describeProviderFailure(
    apiError(429, { error: { message: 'line one\nfake log entry: everything is fine' } }),
    { endpoint: '/x' },
  );
  assert.doesNotMatch(multiline, /\n/);
});

test('each AI route answers a provider failure through the shared handler', () => {
  const routes = [
    'src/app/api/writing/correct/route.ts',
    'src/app/api/speaking/evaluate/route.ts',
    'src/app/api/speaking/chat/route.ts',
    'src/app/api/review/check-rewrite/route.ts',
    'src/app/api/mediation/feedback/route.ts',
  ];
  for (const file of routes) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /providerFailureResponse|reportProviderFailure/, file);

    // The old shape — handing err.message straight to the client — must be gone.
    const handler = source.slice(source.indexOf('export async function POST('));
    assert.doesNotMatch(
      handler,
      /NextResponse\.json\(\s*\{\s*error:\s*errorMessage\s*\}/,
      `${file}: must not return errorMessage to the client`,
    );
    assert.doesNotMatch(handler, /error:\s*err instanceof Error \? err\.message/, `${file}: raw err.message leak`);
  }
});

test('workSaved is only true where the row is written before the failure', () => {
  // Writing, speaking, chat and rewrite keep the learner's input only in the
  // request, so every one of them must ask for the "copy your text" wording.
  for (const file of [
    'src/app/api/writing/correct/route.ts',
    'src/app/api/speaking/evaluate/route.ts',
    'src/app/api/speaking/chat/route.ts',
    'src/app/api/review/check-rewrite/route.ts',
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /workSaved: false/, `${file} must not claim the work is saved`);
    assert.doesNotMatch(source, /workSaved: true/, `${file} stores nothing before the AI call`);
  }

  // Mediation is the exception: it inserts the attempt even when the assessor
  // fails, so a failure there really is "your work is saved".
  const mediation = readFileSync('src/app/api/mediation/feedback/route.ts', 'utf8');
  const assessorCatch = mediation.slice(mediation.indexOf('} catch (error) {'));
  assert.match(assessorCatch.slice(0, 800), /workSaved: true/);
});

test('the alert covers all three facts an operator needs, and no learner data', async () => {
  const { buildProviderAlert } = await import('../../lib/b1b2/provider-alert-email.mjs');
  const { alertGroupKey } = await import('../../lib/b1b2/provider-alert-keys.mjs');
  const built = buildProviderAlert({
    endpoint: '/api/writing/correct',
    model: 'openai/gpt-oss-20b',
    error: apiError(401, GROQ_AUTH_401),
    occurredAt: new Date('2025-07-01T10:30:00Z'),
  });
  assert.equal(built.kind, 'auth');
  assert.match(built.subject, /AI key rejected.*\/api\/writing\/correct/);
  assert.match(built.text, /Endpoint: \/api\/writing\/correct/);
  assert.match(built.text, /HTTP 401/);
  assert.match(built.text, /Invalid API Key/);
  assert.match(built.text, /1 Jul 2025, 12:30/); // Europe/Madrid
  assert.match(built.text, /GROQ_API_KEY/);

  const quota = buildProviderAlert({ endpoint: '/api/speaking/evaluate', model: 'm', error: apiError(429, GROQ_DAILY_429) });
  assert.match(quota.subject, /Daily AI quota used up/);
  assert.match(quota.text, /stops for everyone/);

  // Grouping key is a hash: the endpoint is never stored in the clear, and two
  // endpoints do not silence each other.
  const key = alertGroupKey('/api/writing/correct', 'auth');
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(key, /writing|correct|auth/);
  assert.notEqual(alertGroupKey('/api/speaking/evaluate', 'auth'), key);
});
