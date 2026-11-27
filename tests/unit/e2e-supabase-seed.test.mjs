import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupE2ESupabase } from '../../scripts/cleanup-e2e-supabase.mjs';
import { seedE2ESupabase } from '../../scripts/seed-e2e-supabase.mjs';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';
import { E2E_PROJECT_REF, E2E_PROJECT_URL, LIVE_PROJECT_REF } from '../../scripts/assert-e2e-supabase-target.mjs';

const jwt = (ref) => `header.${Buffer.from(JSON.stringify({ ref })).toString('base64url')}.signature`;
const env = () => ({
  E2E_SUPABASE_PROJECT_REF: E2E_PROJECT_REF,
  E2E_SUPABASE_URL: E2E_PROJECT_URL,
  E2E_SUPABASE_ANON_KEY: jwt(E2E_PROJECT_REF),
  E2E_SUPABASE_SERVICE_ROLE_KEY: jwt(E2E_PROJECT_REF),
  E2E_SUPABASE_DB_URL: `postgresql://postgres.${E2E_PROJECT_REF}:not-a-real-password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
  E2E_RUN_ID: 'seed-run-456',
  E2E_RUN_ATTEMPT: '1',
  E2E_USER_EMAIL: 'e2e-seed-run-456-1@example.invalid',
  E2E_USER_PASSWORD: 'not-a-real-password',
});

function fakeAdmin({ hasProfile = true, hasTask = false, pages } = {}) {
  const calls = [];
  return {
    calls,
    supabaseUrl: E2E_PROJECT_URL,
    auth: {
      admin: {
        async listUsers({ page }) {
          calls.push(['listUsers', page]);
          return { data: { users: pages ? (pages[page - 1] ?? []) : [
            { id: 'other-run-user', email: 'e2e-other-run-2@example.invalid' },
            { id: 'current-run-user', email: 'E2E-seed-run-456-1@example.invalid' },
          ] }, error: null };
        },
        async deleteUser(id) {
          calls.push(['deleteUser', id]);
          return { error: null };
        },
        async createUser(user) {
          calls.push(['createUser', user]);
          return { data: { user: { id: 'new-user', email: user.email, email_confirmed_at: 'now' } }, error: null };
        },
      },
    },
    from(table) {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: hasProfile ? { id: 'new-user' } : null, error: null }) };
            },
            limit() {
              return { maybeSingle: async () => ({ data: hasTask ? { id: 'existing-task' } : null, error: null }) };
            },
            order() {
              return {
                limit() {
                  return { maybeSingle: async () => ({ data: { id: 'module-1' }, error: null }) };
                },
              };
            },
          };
        },
        async insert(row) {
          calls.push(['insert', table, row]);
          return { error: null };
        },
        async upsert(rows, options) {
          calls.push(['upsert', table, rows, options]);
          return { error: null };
        },
      };
    },
  };
}

test('creates a unique per-run learner without looking up or deleting another run account', async () => {
  const admin = fakeAdmin();
  await seedE2ESupabase({ admin, env: env() });

  assert.equal(admin.calls.some(([name]) => name === 'listUsers'), false);
  assert.equal(admin.calls.some(([name]) => name === 'deleteUser'), false);
  const created = admin.calls.find(([name]) => name === 'createUser');
  assert.equal(created[1].email, 'e2e-seed-run-456-1@example.invalid');
  assert.equal(created[1].password, 'not-a-real-password');
  assert.equal(created[1].email_confirm, true);
  const outputs = admin.calls.find(([name, table]) => name === 'upsert' && table === 'week_output_submissions');
  assert.equal(outputs[2].length, 6);
  assert.deepEqual([...new Set(outputs[2].map((row) => row.week_number))], [1, 2, 3]);
  const inputs = admin.calls.find(([name, table]) => name === 'upsert' && table === 'week_input_submissions');
  assert.equal(inputs[2].length, 3);
  const task = admin.calls.find(([name, table]) => name === 'insert' && table === 'writing_tasks');
  assert.deepEqual(task[2], {
    module_id: 'module-1',
    title: 'E2E issue-report fixture',
    prompt: 'Write one short sentence for this isolated E2E fixture.',
    format: 'paragraph',
    word_min: 1,
    word_max: 100,
  });
});

test('cleanup deletes only this run attempt user, never another account', async () => {
  const admin = fakeAdmin();
  const cleaned = [];
  await cleanupE2ESupabase({ admin, env: env(), cleanupUser: async (_admin, id, options) => cleaned.push([id, options]) });
  assert.deepEqual(cleaned, [['current-run-user', { strict: true }]]);
});

test('tagged test users require the pinned E2E client and carry a run-scoped address and metadata', async () => {
  const admin = fakeAdmin();
  const tagged = { ...env(), E2E_TAG_TEST_USERS: 'true' };
  const user = await createTestUser(admin, 'speaking', tagged);
  const payload = admin.calls.find(([name]) => name === 'createUser')[1];
  assert.equal(payload.email, user.email);
  assert.match(payload.email, /^e2e-fixture-seed-run-456-1-[0-9]{13}-[0-9a-f]{8}@example\.test$/);
  assert.deepEqual(payload.app_metadata, {
    arena_e2e_fixture: true, arena_e2e_run_id: 'seed-run-456', arena_e2e_run_attempt: '1', arena_e2e_fixture_kind: 'speaking',
  });
  const wrongClient = fakeAdmin();
  wrongClient.supabaseUrl = `https://${LIVE_PROJECT_REF}.supabase.co`;
  await assert.rejects(createTestUser(wrongClient, 'speaking', tagged), /different Supabase client/);
  assert.deepEqual(wrongClient.calls, []);
});

test('cleanup enumerates pages and selects only fixtures with both this run address and server metadata', async () => {
  const address = (run, attempt, unique) => `e2e-fixture-${run}-${attempt}-1795780000000-${unique}@example.test`;
  const metadata = (run, attempt) => ({ arena_e2e_fixture: true, arena_e2e_run_id: run, arena_e2e_run_attempt: attempt });
  const unrelated = Array.from({ length: 1000 }, (_, index) => ({ id: `other-${index}`, email: `learner-${index}@example.test` }));
  const admin = fakeAdmin({ pages: [unrelated, [
    { id: 'seed', email: 'e2e-seed-run-456-1@example.invalid' },
    { id: 'fixture', email: address('seed-run-456', 1, '12345678'), app_metadata: metadata('seed-run-456', '1') },
    { id: 'wrong-metadata', email: address('seed-run-456', 1, '12345679'), app_metadata: metadata('other-run', '1') },
    { id: 'wrong-email', email: address('other-run', 1, '12345680'), app_metadata: metadata('seed-run-456', '1') },
    { id: 'untagged', email: address('seed-run-456', 1, '12345681') },
  ]] });
  const cleaned = [];
  await cleanupE2ESupabase({ admin, env: env(), cleanupUser: async (_admin, id, options) => cleaned.push([id, options]) });
  assert.deepEqual(admin.calls.filter(([name]) => name === 'listUsers'), [['listUsers', 1], ['listUsers', 2]]);
  assert.deepEqual(cleaned, [['seed', { strict: true }], ['fixture', { strict: true }]]);
});

test('strict fixture cleanup retains auth if private Storage cleanup fails', async () => {
  const admin = fakeAdmin();
  admin.storage = { from: () => ({ list: async () => ({ data: null, error: new Error('storage offline') }) }) };
  admin.from = () => ({ delete: () => ({ eq: async () => ({ error: null }) }) });
  await assert.rejects(deleteTestUser(admin, 'fixture', { strict: true }), /storage offline/);
  assert.equal(admin.calls.some(([name]) => name === 'deleteUser'), false);
});

test('cleanup fails before listing users when the client does not match the isolated target', async () => {
  const admin = fakeAdmin();
  admin.supabaseUrl = `https://${LIVE_PROJECT_REF}.supabase.co`;
  await assert.rejects(cleanupE2ESupabase({ admin, env: env() }), /different Supabase client/);
  assert.deepEqual(admin.calls, []);
});

test('does not touch Supabase when the project ref is not the dedicated E2E ref', async () => {
  const admin = fakeAdmin();
  const unsafe = env();
  unsafe.E2E_SUPABASE_PROJECT_REF = LIVE_PROJECT_REF;
  await assert.rejects(seedE2ESupabase({ admin, env: unsafe }), /Refusing E2E database access/);
  assert.deepEqual(admin.calls, []);
});
