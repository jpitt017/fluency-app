import assert from 'node:assert/strict';
import test from 'node:test';
import { seedE2ESupabase } from '../../scripts/seed-e2e-supabase.mjs';
import { E2E_PROJECT_REF, E2E_PROJECT_URL, LIVE_PROJECT_REF } from '../../scripts/assert-e2e-supabase-target.mjs';

const jwt = (ref) => `header.${Buffer.from(JSON.stringify({ ref })).toString('base64url')}.signature`;
const env = () => ({
  E2E_SUPABASE_PROJECT_REF: E2E_PROJECT_REF,
  E2E_SUPABASE_URL: E2E_PROJECT_URL,
  E2E_SUPABASE_ANON_KEY: jwt(E2E_PROJECT_REF),
  E2E_SUPABASE_SERVICE_ROLE_KEY: jwt(E2E_PROJECT_REF),
  E2E_SUPABASE_DB_URL: `postgresql://postgres.${E2E_PROJECT_REF}:not-a-real-password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
  E2E_USER_EMAIL: 'e2e@example.invalid',
  E2E_USER_PASSWORD: 'not-a-real-password',
});

function fakeAdmin({ hasProfile = true, hasTask = false } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      admin: {
        async listUsers() {
          calls.push(['listUsers']);
          return { data: { users: [{ id: 'old-user', email: 'E2E@example.invalid' }] }, error: null };
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

test('resets the configured account after migrations and creates only a minimal E2E writing-task fixture', async () => {
  const admin = fakeAdmin();
  await seedE2ESupabase({ admin, env: env() });

  assert.ok(admin.calls.some(([name, id]) => name === 'deleteUser' && id === 'old-user'));
  const created = admin.calls.find(([name]) => name === 'createUser');
  assert.equal(created[1].email, 'e2e@example.invalid');
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

test('does not touch Supabase when the project ref is not the dedicated E2E ref', async () => {
  const admin = fakeAdmin();
  const unsafe = env();
  unsafe.E2E_SUPABASE_PROJECT_REF = LIVE_PROJECT_REF;
  await assert.rejects(seedE2ESupabase({ admin, env: unsafe }), /Refusing E2E database access/);
  assert.deepEqual(admin.calls, []);
});
