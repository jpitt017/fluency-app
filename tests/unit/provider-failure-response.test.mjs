import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { learnerFacingProviderError } from '../../lib/b1b2/provider-errors.mjs';

/**
 * The routes cannot be imported here: each one pulls `next/server`, the Supabase
 * server client and a `server-only` boundary, none of which resolve under the
 * plain node test runner. The project's convention is a source-level contract
 * (see ai-route-auth.test.mjs), so that is what this file pins — plus the exact
 * strings, which are tested properly in provider-errors.test.mjs.
 *
 * What must hold, for every AI route:
 *   1. a provider failure goes through providerFailureResponse (or, for the one
 *      route that recovers, reportProviderFailure);
 *   2. no branch hands `errorMessage` or `err.message` to the client;
 *   3. the work-saved claim matches where the learner's data really is.
 */

const AI_ROUTES = [
  'src/app/api/writing/correct/route.ts',
  'src/app/api/speaking/evaluate/route.ts',
  'src/app/api/speaking/chat/route.ts',
  'src/app/api/speaking/transcribe/route.ts',
  'src/app/api/review/check-rewrite/route.ts',
  'src/app/api/mediation/feedback/route.ts',
];

test('no AI route returns the provider error to the client', () => {
  for (const file of AI_ROUTES) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /from '@\/lib\/b1b2\/provider-failure-response'/, `${file} uses the shared handler`);

    // Any `error:` value that is a bare variable/expression the server built from
    // the provider is a leak. Literal strings for validation messages are fine.
    const leaks = [...source.matchAll(/error:\s*(errorMessage|err\.message|error\.message|String\(err\)|String\(error\))/g)];
    assert.deepEqual(leaks.map((m) => m[1]), [], `${file} leaks the provider error`);

    // The handler itself must never be built from err.message.
    assert.doesNotMatch(source, /errorMessage = (err|error) instanceof Error \? \1\.message/, `${file}`);
  }
});

test('a missing API key is treated as an auth fault, not a config message for learners', () => {
  for (const file of [
    'src/app/api/writing/correct/route.ts',
    'src/app/api/speaking/evaluate/route.ts',
    'src/app/api/speaking/chat/route.ts',
    'src/app/api/mediation/feedback/route.ts',
  ]) {
    const source = readFileSync(file, 'utf8');
    // The old shape named GROQ_API_KEY in the response body.
    assert.doesNotMatch(source, /NextResponse\.json\(\{ error: 'GROQ_API_KEY is not configured'/, file);
    assert.match(source, /status: 401 \}\)/, `${file} reports a missing key as a 401 so it alerts`);
  }
});

test('the learner-facing status is 503 (or 429 for quota), never the provider status', () => {
  const helper = readFileSync('lib/b1b2/provider-failure-response.ts', 'utf8');
  assert.match(helper, /const status = providerFailureHttpStatus\(error\)/);
  assert.match(helper, /error: learner\.message/);
  assert.doesNotMatch(helper, /error: errorMessage/);
});

test('every message the handler can send is one of the three approved sentences', () => {
  const approved = new Set([
    "Feedback isn't working right now. Your work is saved. Please try again later.",
    "Feedback isn't working right now. Please copy your text before you try again.",
    "Feedback isn't working right now. Your recording isn't saved. Please try again later.",
    'Feedback has stopped for today. Please try again tomorrow.',
  ]);

  const shapes = [];
  for (const status of [401, 429, undefined]) {
    for (const daily of [true, false]) {
      for (const workSaved of [true, false]) {
        for (const workKind of ['text', 'recording']) {
          const error = Object.assign(new Error('provider said: Invalid API Key org_01ABC'), {
            status: daily ? 429 : status,
            error: daily ? { error: { message: 'tokens per day (TPD) limit 200000' } } : { error: { message: 'Invalid API Key' } },
          });
          shapes.push(learnerFacingProviderError(error, { workSaved, workKind }).message);
        }
      }
    }
  }
  for (const message of shapes) assert.ok(approved.has(message), `unapproved message: ${message}`);
  assert.equal(new Set(shapes).size, 4, 'all four sentences are reachable');
});

test('the mediation route keeps its own generic error and flags low confidence', () => {
  const source = readFileSync('src/app/api/mediation/feedback/route.ts', 'utf8');
  // It recovers instead of failing: the attempt is saved, so it reports rather
  // than returns a provider error.
  assert.match(source, /reportProviderFailure\(\{/);
  assert.match(source, /workSaved: true/);
  // A dead assessor must still reach a teacher: zero confidence does that through
  // the existing decideMediationReview rule.
  assert.match(source, /confidence = 0;/);
});

test('the handler builds the right status and body for a 401, a 429 and a timeout', async () => {
  // This exercises the real function, with only the Next response builder faked.
  const { providerFailureResponse } = await import('../../lib/b1b2/provider-failure-response.ts');

  const seen = [];
  const json = (body, init) => ({ body, status: init.status, headers: init.headers });

  const authError = Object.assign(new Error('401 {"error":{"message":"Invalid API Key","code":"invalid_api_key"}}'), {
    name: 'APIError',
    status: 401,
    error: { error: { message: 'Invalid API Key', code: 'invalid_api_key' } },
  });
  const rateError = Object.assign(new Error('429 rate limit'), {
    name: 'APIError',
    status: 429,
    error: { error: { message: 'Rate limit reached on tokens per minute (TPM)', code: 'rate_limit_exceeded' } },
  });
  const quotaError = Object.assign(new Error('429 daily'), {
    name: 'APIError',
    status: 429,
    error: { error: { message: 'Rate limit reached on tokens per day (TPD): Limit 200000', code: 'rate_limit_exceeded' } },
  });
  const timeout = Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });

  const cases = [
    { failure: authError, workSaved: true, status: 503, message: "Feedback isn't working right now. Your work is saved. Please try again later.", code: 'ai_unavailable_saved', retryable: true },
    { failure: authError, workSaved: false, status: 503, message: "Feedback isn't working right now. Please copy your text before you try again.", code: 'ai_unavailable', retryable: true },
    { failure: rateError, workSaved: false, status: 429, message: "Feedback isn't working right now. Please copy your text before you try again.", code: 'ai_unavailable', retryable: true },
    { failure: quotaError, workSaved: false, status: 429, message: 'Feedback has stopped for today. Please try again tomorrow.', code: 'ai_daily_quota', retryable: false },
    { failure: timeout, workSaved: false, status: 503, message: "Feedback isn't working right now. Please copy your text before you try again.", code: 'ai_unavailable', retryable: true },
  ];

  for (const testCase of cases) {
    const result = await providerFailureResponse({
      admin: null,
      endpoint: '/api/writing/correct',
      model: 'openai/gpt-oss-20b',
      error: testCase.failure,
      workSaved: testCase.workSaved,
      json,
      // No mail is attempted from a unit test: the alerter is stubbed, and the
      // module that would send it is not even loaded.
      sendAlert: async () => false,
    });
    seen.push(result);
    assert.equal(result.status, testCase.status);
    const body = result.response.body;
    assert.deepEqual(body, {
      error: testCase.message,
      code: testCase.code,
      retryable: testCase.retryable,
    });
    // The provider's words live on the returned errorMessage for the log only.
    assert.doesNotMatch(JSON.stringify(body), /groq|openai|org_|Invalid API Key|TPD/i);
  }
  assert.equal(seen.length, 5);
  assert.match(seen[0].errorMessage, /Invalid API Key/, 'the server-side detail is preserved');
});
