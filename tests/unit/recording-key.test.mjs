import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { freshRecordingKeyId } from '../../lib/b1b2/recording-key.mjs';
import { legacyRecordingKeyFixture } from '../helpers/legacy-recording-key-fixture.mjs';

const GENERATION = '33333333-3333-4333-8333-333333333333';
const legacyAdmin = (fixture) => ({ from(table) { assert.equal(table, 'ai_request_logs'); return fixture.table; } });

test('new-schema allocation returns only the database-issued UUIDv8 namespace', async () => {
  let called = 0;
  const admin = { rpc: async (name) => {
    assert.equal(name, 'allocate_recording_key');
    called += 1;
    return { data: 'FAAAAAAA-BBBB-8CCC-8DDD-EEEEEEEEEEEE', error: null };
  } };
  assert.equal(await freshRecordingKeyId(admin, GENERATION), 'faaaaaaa-bbbb-8ccc-8ddd-eeeeeeeeeeee');
  assert.equal(called, 1);
});

test('0081 errors, a wrong namespace and malformed IDs fail closed', async () => {
  for (const result of [
    { data: null, error: { code: 'PGRST202' } },
    { data: '11111111-1111-4111-8111-111111111111', error: null },
    { data: '00000000-0000-8000-8000-000000000001', error: null },
    { data: null, error: null },
  ]) {
    await assert.rejects(() => freshRecordingKeyId({ rpc: async () => result }, GENERATION), /allocation is unavailable/);
  }
  await assert.rejects(() => freshRecordingKeyId(null, GENERATION), /allocation is unavailable/);
  await assert.rejects(() => freshRecordingKeyId({}, undefined), /allocation is unavailable/);
});

test('0080 consumes a persistent identity without retaining a learner-linked row', async () => {
  const fixture = legacyRecordingKeyFixture();
  const admin = legacyAdmin(fixture);
  const ids = await Promise.all(Array.from({ length: 200 }, () => freshRecordingKeyId(admin, null)));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^00000000-0000-8000-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));
  assert.equal(fixture.rows.size, 0);
  for (const [kind, value] of fixture.calls) {
    if (kind === 'insert') assert.deepEqual(value, { user_id: null, endpoint: '/internal/recording-key-allocation',
      model: 'internal', status_code: 204, latency_ms: 0 });
    if (kind === 'insert-select' || kind === 'delete-select') assert.equal(value, 'id::text');
    if (kind === 'delete') {
      assert.equal(value.endpoint, '/internal/recording-key-allocation');
      assert.equal(value.user_id, null);
      assert.match(value.id, /^[1-9][0-9]*$/);
    }
  }
  // 0081 f-prefixed UUIDv8s and old UUIDv4s cannot share this namespace.
  assert.ok(ids.every((id) => id[0] !== 'f' && id[14] !== '4'));
});

test('the real Supabase client requests text identity and targets only its ownerless row', async () => {
  const calls = [];
  const counter = '9007199254740993'; // beyond JavaScript's safe integer range
  const admin = createClient('https://unit.invalid', 'synthetic-service-key', {
    auth: { persistSession: false }, global: { fetch: async (input, init) => {
      calls.push({ url: new URL(String(input)), method: init.method, body: init.body, headers: new Headers(init.headers) });
      return new Response(JSON.stringify(init.method === 'POST' ? { id: counter } : [{ id: counter }]),
        { status: init.method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  assert.match(await freshRecordingKeyId(admin, null), /^00000000-0000-8000-8/);
  assert.deepEqual(calls.map((call) => call.method), ['POST', 'DELETE']);
  for (const call of calls) {
    assert.equal(call.url.pathname, '/rest/v1/ai_request_logs');
    assert.equal(call.url.searchParams.get('select'), 'id::text');
    assert.match(call.headers.get('prefer'), /return=representation/);
  }
  assert.deepEqual(JSON.parse(calls[0].body), { user_id: null, endpoint: '/internal/recording-key-allocation',
    model: 'internal', status_code: 204, latency_ms: 0 });
  assert.equal(calls[1].url.searchParams.get('id'), `eq.${counter}`);
  assert.equal(calls[1].url.searchParams.get('endpoint'), 'eq./internal/recording-key-allocation');
  assert.equal(calls[1].url.searchParams.get('user_id'), 'is.null');
});

test('0080 allocation fails closed on ambiguous or malformed identity/cleanup results', async () => {
  for (const change of [
    { insertError: true }, { deleteError: true },
    { insertedId: null }, { insertedId: '0' }, { insertedId: '-1' }, { insertedId: '1.5' },
    { insertedId: '1152921504606846976' }, { insertedId: Number.MAX_SAFE_INTEGER + 1 },
    { deletedId: '2' },
  ]) {
    const fixture = legacyRecordingKeyFixture();
    Object.assign(fixture.state, change);
    await assert.rejects(() => freshRecordingKeyId(legacyAdmin(fixture), null), /allocation is unavailable/);
  }
  await assert.rejects(() => freshRecordingKeyId(null, null), /allocation is unavailable/);
});

test('a lost 0080 acknowledgment consumes an identity; retry never reuses it', async () => {
  const fixture = legacyRecordingKeyFixture();
  fixture.state.deleteError = true;
  await assert.rejects(() => freshRecordingKeyId(legacyAdmin(fixture), null), /allocation is unavailable/);
  fixture.state.deleteError = false;
  const id = await freshRecordingKeyId(legacyAdmin(fixture), null);
  assert.match(id, /^00000000-0000-8000-8/);
  assert.equal(fixture.rows.has('1'), true); // ownerless; normal log retention removes it
  assert.equal(fixture.rows.has('2'), false);
  const next = await freshRecordingKeyId(legacyAdmin(fixture), null);
  assert.notEqual(id, next);
});
