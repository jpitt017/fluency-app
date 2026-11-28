import test from 'node:test';
import assert from 'node:assert/strict';
import { freshRecordingKeyId } from '../../lib/b1b2/recording-key.mjs';

const GENERATION = '33333333-3333-4333-8333-333333333333';

test('new-schema allocation returns only the database-issued UUIDv8', async () => {
  let called = 0;
  const admin = { rpc: async (name) => {
    assert.equal(name, 'allocate_recording_key');
    called += 1;
    return { data: 'AAAAAAAA-BBBB-8CCC-8DDD-EEEEEEEEEEEE', error: null };
  } };
  assert.equal(await freshRecordingKeyId(admin, GENERATION), 'aaaaaaaa-bbbb-8ccc-8ddd-eeeeeeeeeeee');
  assert.equal(called, 1);
});

test('0081 errors and malformed IDs fail closed rather than silently using random keys', async () => {
  for (const result of [
    { data: null, error: { code: 'PGRST202' } },
    { data: '11111111-1111-4111-8111-111111111111', error: null },
    { data: null, error: null },
  ]) {
    await assert.rejects(() => freshRecordingKeyId({ rpc: async () => result }, GENERATION), /allocation is unavailable/);
  }
  await assert.rejects(() => freshRecordingKeyId(null, GENERATION), /allocation is unavailable/);
  await assert.rejects(() => freshRecordingKeyId({}, undefined), /allocation is unavailable/);
});

test('0080 remains compatible using a fresh random UUIDv4, without an unavailable RPC', async () => {
  const admin = { rpc: async () => { throw new Error('0080 has no allocator'); } };
  const first = await freshRecordingKeyId(admin, null);
  const second = await freshRecordingKeyId(admin, null);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, second);
});
