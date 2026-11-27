import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as epoch from '../../lib/b1b2/deletion-epoch.mjs';
import { readDeletionGeneration } from '../../lib/b1b2/deletion-generation.mjs';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OLD = '33333333-3333-4333-8333-333333333333';
const NEW = '44444444-4444-4444-8444-444444444444';
const cookie = (gen = OLD, owner = USER) => `${epoch.DELETION_EPOCH_COOKIE}=${owner}.${gen}`;

function loadTs(file, modules, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, Headers, URL, Request, console, ...globals, require(name) {
    if (!(name in modules)) throw new Error(`Unexpected module ${name}`);
    return modules[name];
  } });
  return exports;
}

test('generation parsing and direct browser writes fail closed and preserve explicit workflow epochs', async () => {
  assert.deepEqual(epoch.parseDeletionEpoch(`${USER}.${OLD}`), { owner: USER, generation: OLD });
  assert.equal(epoch.parseDeletionEpoch(`${USER}.bad`), null);
  assert.equal(epoch.parseDeletionEpoch(`${USER}.${OLD}.extra`), null);
  assert.equal(epoch.browserDeletionGeneration(`another=1; ${cookie()}`), OLD);
  assert.equal(epoch.browserDeletionGeneration('unrelated=value'), 'missing');
  assert.equal(epoch.browserDeletionGeneration(`${epoch.DELETION_EPOCH_COOKIE}=%broken`), 'missing');
  let current = cookie();
  const seen = [];
  const fetch = epoch.browserDeletionFetch(async (url, init) => {
    seen.push({ url, method: init.method, headers: new Headers(init.headers) });
    return { ok: true };
  }, 'https://fixture.supabase.co', () => current);
  await fetch('https://fixture.supabase.co/rest/v1/writing_submissions', { method: 'POST', headers: { authorization: 'Bearer synthetic' } });
  current = cookie(NEW);
  await fetch('https://fixture.supabase.co/rest/v1/profiles', { method: 'PATCH', headers: { [epoch.DELETION_EPOCH_HEADER]: OLD } });
  await fetch('https://fixture.supabase.co/rest/v1/profiles', { method: 'GET' });
  await fetch('https://fixture.supabase.co/auth/v1/user', { method: 'POST' });
  assert.equal(seen[0].headers.get(epoch.DELETION_EPOCH_HEADER), OLD);
  assert.equal(seen[0].headers.get('authorization'), 'Bearer synthetic');
  assert.equal(seen[1].headers.get(epoch.DELETION_EPOCH_HEADER), OLD);
  assert.equal(seen[2].headers.has(epoch.DELETION_EPOCH_HEADER), false);
  assert.equal(seen[3].headers.has(epoch.DELETION_EPOCH_HEADER), false);
  const missing = epoch.browserDeletionFetch(async (_url, init) => new Headers(init.headers), 'https://fixture.supabase.co', () => { throw new Error('blocked'); });
  assert.equal((await missing('https://fixture.supabase.co/rest/v1/example', { method: 'POST' })).get(epoch.DELETION_EPOCH_HEADER), 'missing');
});

function proxyFixture({ generation = NEW, error = null, user = USER, refresh = false } = {}) {
  const reads = [];
  const proxy = loadTs('src/proxy.ts', {
    'next/server': { NextResponse },
    '@/lib/b1b2/deletion-epoch.mjs': epoch,
    '@supabase/ssr': { createServerClient: (_url, _key, options) => ({
      auth: { getUser: async () => {
        if (refresh) options.cookies.setAll([{ name: 'sb-test-auth-token', value: 'refreshed', options: { path: '/', httpOnly: true } }]);
        return { data: { user: user ? { id: user } : null } };
      } },
      from: (table) => ({ select: () => ({ eq: (_column, id) => ({ maybeSingle: async () => {
        reads.push({ table, id });
        return { data: error ? null : { data_deletion_generation: generation }, error };
      } }) }) }),
    }) },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture' } } }).proxy;
  return { proxy, reads };
}

function inbound(path, { method = 'GET', value = cookie(), headers = {}, authenticated = true } = {}) {
  const list = [authenticated ? 'sb-test-auth-token=old-session' : '', value].filter(Boolean).join('; ');
  return new NextRequest(`https://app.example.test${path}`, { method, headers: { cookie: list, ...headers } });
}
const forwarded = (response, name) => response.headers.get(`x-middleware-request-${name}`);

test('proxy issues a fresh epoch only on page navigation and preserves refreshed auth cookies', async () => {
  const f = proxyFixture({ refresh: true });
  const response = await f.proxy(inbound('/privacy', { headers: { [epoch.DELETION_OWNER_HEADER]: OTHER, [epoch.DELETION_EPOCH_HEADER]: OLD } }));
  assert.equal(forwarded(response, epoch.DELETION_OWNER_HEADER), USER);
  assert.equal(forwarded(response, epoch.DELETION_EPOCH_HEADER), NEW);
  assert.equal(response.cookies.get(epoch.DELETION_EPOCH_COOKIE).value, `${USER}.${NEW}`);
  assert.equal(response.cookies.get('sb-test-auth-token').value, 'refreshed');
  assert.deepEqual(f.reads, [{ table: 'profiles', id: USER }]);

  const oldSchema = proxyFixture({ error: { code: '42703' } });
  const compatible = await oldSchema.proxy(inbound('/privacy', { value: '' }));
  assert.equal(forwarded(compatible, epoch.DELETION_EPOCH_HEADER), 'missing');
  assert.equal(compatible.cookies.get(epoch.DELETION_EPOCH_COOKIE), undefined);
});

test('proxy pins POSTs to the pre-deletion cookie or explicit recording epoch, never a new database read', async () => {
  const f = proxyFixture();
  const post = await f.proxy(inbound('/api/writing/correct', { method: 'POST', value: cookie(OLD), headers: { [epoch.DELETION_OWNER_HEADER]: OTHER } }));
  assert.equal(forwarded(post, epoch.DELETION_OWNER_HEADER), USER);
  assert.equal(forwarded(post, epoch.DELETION_EPOCH_HEADER), OLD);
  assert.equal(f.reads.length, 0);
  const recorded = await f.proxy(inbound('/api/week/speaking/capture', {
    method: 'POST', value: cookie(NEW), headers: { [epoch.DELETION_EPOCH_HEADER]: OLD },
  }));
  assert.equal(forwarded(recorded, epoch.DELETION_EPOCH_HEADER), OLD);
  const invalid = await f.proxy(inbound('/api/week/speaking/capture', {
    method: 'POST', value: cookie(NEW), headers: { [epoch.DELETION_EPOCH_HEADER]: 'bad' },
  }));
  assert.equal(forwarded(invalid, epoch.DELETION_EPOCH_HEADER), 'missing');
  const wrongOwner = await f.proxy(inbound('/api/week/input', { method: 'POST', value: cookie(OLD, OTHER) }));
  assert.equal(forwarded(wrongOwner, epoch.DELETION_EPOCH_HEADER), 'missing');
  const unverified = await proxyFixture({ user: null }).proxy(inbound('/api/week/input', { method: 'POST' }));
  assert.equal(forwarded(unverified, epoch.DELETION_OWNER_HEADER), 'unverified');
  const anonymous = await f.proxy(inbound('/api/week/input', {
    method: 'POST', authenticated: false, value: '', headers: { [epoch.DELETION_OWNER_HEADER]: USER, [epoch.DELETION_EPOCH_HEADER]: NEW },
  }));
  assert.equal(forwarded(anonymous, epoch.DELETION_OWNER_HEADER), null);
  assert.equal(forwarded(anonymous, epoch.DELETION_EPOCH_HEADER), null);
});

test('late uploads retain their starting epoch, and missing post-deletion context fails closed', async () => {
  const client = (data, error = null) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) }) });
  const marker = { data_deletion_generation: NEW, data_deletion_completed_at: '2026-01-01T00:00:00Z' };
  const headers = new Headers({ [epoch.DELETION_OWNER_HEADER]: USER, [epoch.DELETION_EPOCH_HEADER]: OLD });
  assert.equal(await readDeletionGeneration(client(marker), USER, headers), OLD);
  await assert.rejects(() => readDeletionGeneration(client(marker), USER, new Headers()), /Refresh/);
  assert.equal(await readDeletionGeneration(client({ ...marker, data_deletion_completed_at: null }), USER, new Headers()), NEW);
  assert.equal(await readDeletionGeneration(client(null, { code: '42703' }), USER, headers), null);
  await assert.rejects(() => readDeletionGeneration(client(null, { code: 'network' }), USER, headers), /unavailable/);
});

test('server and service-role clients propagate only request-scoped generation context', async () => {
  const seen = [];
  let inboundHeaders = new Headers({ [epoch.DELETION_OWNER_HEADER]: USER, [epoch.DELETION_EPOCH_HEADER]: OLD });
  const fakeFetch = async (input, init) => { seen.push({ input, headers: new Headers(init?.headers) }); return { ok: true }; };
  let options;
  const { createAdminSupabase } = loadTs('utils/supabase/admin.ts', {
    '@supabase/supabase-js': { createClient: (_url, _key, config) => { options = config; return {}; } },
    'next/headers': { headers: async () => inboundHeaders },
    '@/lib/b1b2/deletion-epoch.mjs': epoch,
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' } }, fetch: fakeFetch });
  createAdminSupabase();
  await options.global.fetch('https://fixture.supabase.co/rest/v1/week_input_submissions', { method: 'POST', headers: { authorization: 'Bearer service' } });
  assert.equal(seen[0].headers.get(epoch.DELETION_OWNER_HEADER), USER);
  assert.equal(seen[0].headers.get(epoch.DELETION_EPOCH_HEADER), OLD);
  assert.equal(seen[0].headers.get('authorization'), 'Bearer service');
  inboundHeaders = new Headers(); // trusted cron has no learner actor
  await options.global.fetch('https://fixture.supabase.co/rest/v1/rpc/cleanup', { method: 'POST' });
  assert.equal(seen[1].headers.has(epoch.DELETION_OWNER_HEADER), false);

  let serverOptions;
  const { createServerSupabase } = loadTs('utils/supabase/server.ts', {
    '@supabase/ssr': { createServerClient: (_url, _key, config) => { serverOptions = config; return {}; } },
    'next/headers': { headers: async () => new Headers({ [epoch.DELETION_OWNER_HEADER]: USER, [epoch.DELETION_EPOCH_HEADER]: OLD }), cookies: async () => ({ getAll: () => [] }) },
    '@/lib/b1b2/deletion-epoch.mjs': epoch,
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic' } } });
  await createServerSupabase();
  assert.equal(serverOptions.global.headers[epoch.DELETION_OWNER_HEADER], USER);
  assert.equal(serverOptions.global.headers[epoch.DELETION_EPOCH_HEADER], OLD);
});
