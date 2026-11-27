import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserClient } from '@supabase/ssr';
import { browserDeletionFetch } from '../../lib/b1b2/deletion-epoch.mjs';
import { checkDeletionCors } from '../../scripts/check-e2e-deletion-cors.mjs';
import { E2E_PROJECT_URL } from '../../scripts/assert-e2e-supabase-target.mjs';

function preflight({ status = 204, origin = '*', methods = 'POST, PATCH, DELETE', allowed } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const headers = new Headers({ 'access-control-allow-origin': origin, 'access-control-allow-methods': methods,
      'access-control-allow-headers': allowed ?? init.headers['access-control-request-headers'] });
    return new Response(null, { status, headers });
  };
  return { fetch, calls };
}

test('the read-only CORS check is pinned to E2E and exercises real browser write headers', async () => {
  const f = preflight();
  assert.equal(await checkDeletionCors(E2E_PROJECT_URL, f.fetch), true);
  assert.deepEqual(f.calls.map((call) => call.init.headers['access-control-request-method']), ['POST', 'PATCH', 'DELETE']);
  assert.ok(f.calls.every((call) => call.init.method === 'OPTIONS' && call.url === `${E2E_PROJECT_URL}/rest/v1/profiles`));
  assert.match(f.calls[0].init.headers['access-control-request-headers'], /x-fluency-data-generation/);
  assert.equal(f.calls[0].init.headers.authorization, undefined, 'no API key or credential is sent');
  await assert.rejects(() => checkDeletionCors('https://production.example.invalid', f.fetch), /outside the dedicated E2E/);
  assert.equal(f.calls.length, 3, 'unsafe target must not be contacted');
});

test('the checked header set covers actual browser SDK write requests', async () => {
  const preflights = preflight();
  await checkDeletionCors(E2E_PROJECT_URL, preflights.fetch);
  const requested = new Set(preflights.calls[0].init.headers['access-control-request-headers'].split(','));
  const requests = [];
  const client = createBrowserClient(E2E_PROJECT_URL, 'synthetic-key', {
    isSingleton: false,
    cookies: { getAll: () => [], setAll: () => {} },
    global: { fetch: browserDeletionFetch(async (_url, init) => {
      requests.push({ method: init.method, headers: [...new Headers(init.headers).keys()] });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }, E2E_PROJECT_URL, () => '') },
  });
  await client.from('profiles').insert({ xp_total: 1 }).select();
  await client.from('profiles').update({ xp_total: 2 }).eq('id', '11111111-1111-4111-8111-111111111111').select();
  await client.from('profiles').delete().eq('id', '11111111-1111-4111-8111-111111111111').select();
  assert.deepEqual(requests.map(({ method }) => method), ['POST', 'PATCH', 'DELETE']);
  for (const request of requests) {
    for (const name of request.headers) assert.ok(requested.has(name), `${request.method} SDK header ${name} was not checked`);
  }
});

test('the check rejects a missing custom header, missing Authorization, origin and method', async () => {
  await assert.rejects(() => checkDeletionCors(E2E_PROJECT_URL, preflight({ allowed: 'authorization,apikey,content-type' }).fetch), /all browser database headers/);
  await assert.rejects(() => checkDeletionCors(E2E_PROJECT_URL, preflight({ allowed: '*' }).fetch), /all browser database headers/);
  await assert.rejects(() => checkDeletionCors(E2E_PROJECT_URL, preflight({ origin: 'https://other.invalid' }).fetch), /browser origin/);
  await assert.rejects(() => checkDeletionCors(E2E_PROJECT_URL, preflight({ methods: 'GET, POST' }).fetch), /PATCH/);
  await assert.rejects(() => checkDeletionCors(E2E_PROJECT_URL, preflight({ status: 403 }).fetch), /HTTP 403/);
  assert.equal(await checkDeletionCors(E2E_PROJECT_URL, preflight({ allowed: '*, authorization' }).fetch), true);
});
