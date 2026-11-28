import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { assertE2ESupabaseApiTarget } from '../../scripts/assert-e2e-supabase-target.mjs';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';
import { expect, test } from './helpers/isolated-test.mjs';

const ROUTE_ENDPOINTS = [
  '/api/issues/transcribe',
  '/api/writing/correct',
  '/api/week/sentence',
  '/api/speaking/evaluate',
  '/api/speaking/chat',
  '/api/speaking/transcribe',
  '/api/review/check-rewrite',
  '/api/mediation/feedback',
];

function makeTinyWav() {
  const wav = Buffer.alloc(46);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(2, 40);
  return wav;
}

async function signIn(page, email, password) {
  await page.goto('/login');
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/labs|\/teacher/);
}

// The test intentionally makes many sequential requests to isolated Supabase,
// including cleanup of 36 tables. Label timings without logging learner data or
// credentials so a timeout identifies its stage rather than only the test name.
async function timed(label, action) {
  return test.step(label, async () => {
    const startedAt = Date.now();
    const retry = test.info().retry;
    const record = (event) => appendFileSync(process.env.E2E_AI_LOG_TIMING_FILE, `${JSON.stringify({ retry, label, ...event })}\n`);
    record({ phase: 'start' });
    try { return await action(); }
    finally {
      const ms = Date.now() - startedAt;
      record({ phase: 'finish', ms });
      console.log(`[AI logging E2E] ${label}: ${ms}ms`);
    }
  });
}

const REQUEST_TIMEOUT = 20_000;

test('0061 denies anon RPC, attributes signed-in requests, and preserves API route logging', async ({ page, request }) => {
  const url = process.env.E2E_SUPABASE_URL;
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!url || !anonKey || !serviceKey, 'Requires the isolated E2E Supabase project credentials');
  // The default 45 seconds includes setup, eight route calls, and cleanup; the
  // 0081 guards add DB round trips. Keep a finite test-specific budget without
  // disabling retries, route assertions, or fixture cleanup.
  test.setTimeout(120_000);
  if (process.env.GROQ_API_KEY !== 'e2e-mock-only'
      || process.env.GROQ_BASE_URL !== 'http://127.0.0.1:1'
      || !process.env.E2E_AI_MOCK_AUDIT_FILE
      || !process.env.E2E_AI_LOG_TIMING_FILE
      || !process.env.NODE_OPTIONS?.includes('mock-ai-provider.cjs')) {
    throw new Error('AI logging E2E requires the offline provider mock, audit, and timing file');
  }
  if (process.env.E2E_TAG_TEST_USERS !== 'true') throw new Error('AI logging E2E requires tagged isolated fixtures');
  assertE2ESupabaseApiTarget();

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const marker = randomUUID();
  const endpoint = `/__tests__/0061/${marker}/${'e'.repeat(240)}`;
  const model = `${marker}/${'m'.repeat(240)}`;
  const errText = 'synthetic diagnostic '.repeat(50);
  const anonStartedAt = new Date(Date.now() - 5_000).toISOString();
  let userId = null;
  let testUser = null;
  let signedClient = null;

  const anonymousCall = await timed('anonymous logging RPC', () => anonymous.rpc('log_ai_request', {
    p_endpoint: `/__tests__/0061/anon/${marker}`,
    p_model: 'test-model',
    p_status_code: 200,
    p_latency_ms: 2,
  }));
  expect(anonymousCall.error, 'anon RPC must fail after migration 0061').toBeTruthy();
  expect(anonymousCall.error.message.toLowerCase()).toContain('permission denied');

  try {
    testUser = await timed('create isolated test user', () => createTestUser(admin, 'ai-request-logging'));
    userId = testUser.id;
    // The logging contract deliberately exercises more than five AI routes in
    // one minute. Give only this tagged fixture the normal pilot allowance;
    // quota and RLS enforcement still execute and have their own integration tests.
    const pilot = await timed('enable pilot allowance for isolated fixture', () => admin.from('pilot_learners').insert({ user_id: userId }));
    expect(pilot.error).toBeNull();

    signedClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await timed('authenticate test user', () => signedClient.auth.signInWithPassword({ email: testUser.email, password: testUser.password }));
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.user?.id).toBe(userId);

    const signedCall = await timed('signed-in logging RPC', () => signedClient.rpc('log_ai_request', {
      p_endpoint: endpoint,
      p_model: model,
      p_status_code: 200,
      p_latency_ms: 4,
      p_error_message: errText,
    }));
    expect(signedCall.error).toBeNull();

    const stored = await timed('read signed-in RPC log', () => admin.from('ai_request_logs')
      .select('user_id,endpoint,model,error_message')
      .eq('user_id', userId)
      .eq('endpoint', endpoint.slice(0, 200))
      .eq('model', model.slice(0, 200))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle());
    expect(stored.error).toBeNull();
    expect(stored.data).toMatchObject({ user_id: userId, endpoint: endpoint.slice(0, 200), model: model.slice(0, 200) });
    expect(stored.data.error_message).toHaveLength(500);

    // An unauthenticated route can still record the denied request through the
    // service-role logger. Its function derives user_id from auth.uid(), so it
    // remains null rather than accepting caller-supplied attribution.
    const anonymousRoute = await timed('anonymous speaking route', () => request.post('/api/speaking/chat', {
      data: { messages: [] }, timeout: REQUEST_TIMEOUT,
    }));
    expect(anonymousRoute.status()).toBe(401);

    await timed('browser sign-in', () => signIn(page, testUser.email, testUser.password));
    const routeStartedAt = new Date(Date.now() - 5_000).toISOString();

    const writing = await timed('writing route', () => page.request.post('/api/writing/correct', {
      data: { text: 'test input' }, timeout: REQUEST_TIMEOUT,
    }));
    expect(writing.status() < 500 || writing.status() === 503).toBe(true);

    // Use-it checks require two or three sentences. A one-sentence input now
    // returns before the AI/logging path, so it cannot verify attribution.
    const sentence = await timed('sentence route', () => page.request.post('/api/week/sentence', {
      data: { week: 1, id: 'W1-U1', answer: 'I used to visit my grandmother every summer. Now I live far away.' },
      timeout: REQUEST_TIMEOUT,
    }));
    expect([200, 503], `sentence check did not reach the provider/logging path: ${await sentence.text()}`).toContain(sentence.status());

    const evaluate = await timed('speaking evaluation route', () => page.request.post('/api/speaking/evaluate', {
      data: {}, timeout: REQUEST_TIMEOUT,
    }));
    expect(evaluate.status() < 500 || evaluate.status() === 503).toBe(true);

    const chat = await timed('speaking chat route', () => page.request.post('/api/speaking/chat', {
      data: { messages: [{ role: 'user', content: 'A short synthetic test message.' }] }, timeout: REQUEST_TIMEOUT,
    }));
    expect(chat.status() < 500 || chat.status() === 503).toBe(true);

    const transcribe = await timed('speaking transcription route', () => page.request.post('/api/speaking/transcribe', {
      multipart: {}, timeout: REQUEST_TIMEOUT,
    }));
    expect(transcribe.status() < 500 || transcribe.status() === 503).toBe(true);

    const mediation = await timed('mediation route', () => page.request.post('/api/mediation/feedback', {
      data: {}, timeout: REQUEST_TIMEOUT,
    }));
    expect(mediation.status() < 500 || mediation.status() === 503).toBe(true);

    const issue = await timed('issue transcription route', () => page.request.post('/api/issues', {
      multipart: {
        type: 'feedback',
        mode: 'voice',
        audio: { name: 'synthetic.wav', mimeType: 'audio/wav', buffer: makeTinyWav() },
      },
      timeout: REQUEST_TIMEOUT,
    }));
    expect(issue.status() < 500 || issue.status() === 503).toBe(true);

    const seededCard = await timed('create review fixture', () => admin.from('error_review_cards').insert({
      user_id: userId,
      category: 'tense',
      prompt_sentence: 'I went to work yesterday.',
      corrected_sentence: 'I have gone to work every day this week.',
      explanation: 'A synthetic E2E fixture for logging coverage.',
      normalized_key: `ai-log-${marker}`,
    }).select('id').single());
    expect(seededCard.error).toBeNull();
    const rewrite = await timed('review rewrite route', () => page.request.post('/api/review/check-rewrite', {
      data: { cardId: seededCard.data.id, rewrite: 'A deliberately incorrect rewrite.' }, timeout: REQUEST_TIMEOUT,
    }));
    expect(rewrite.status() < 500 || rewrite.status() === 503).toBe(true);

    const routeLogs = await timed('read attributed route logs', () => admin.from('ai_request_logs')
      .select('endpoint,user_id')
      .eq('user_id', userId)
      .gte('created_at', routeStartedAt)
      .in('endpoint', ROUTE_ENDPOINTS));
    expect(routeLogs.error).toBeNull();
    const seen = new Set((routeLogs.data ?? []).map((row) => row.endpoint));
    for (const routeEndpoint of ROUTE_ENDPOINTS) {
      expect(seen.has(routeEndpoint), `expected an attributed log for ${routeEndpoint}`).toBe(true);
    }
    expect(routeLogs.data.every((row) => row.user_id === userId)).toBe(true);

    const anonymousLogs = await timed('read anonymous route log', () => admin.from('ai_request_logs')
      .select('id')
      .is('user_id', null)
      .eq('endpoint', '/api/speaking/chat')
      .gte('created_at', anonStartedAt));
    expect(anonymousLogs.error).toBeNull();
    expect(anonymousLogs.data.length).toBeGreaterThan(0);
  } finally {
    if (userId) await timed('remove isolated test user', () => deleteTestUser(admin, userId));
  }
});
