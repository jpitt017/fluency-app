// One-time recovery of three exact synthetic users left by CI run 46003905885.
// Remove this script and its workflow step after the isolated cleanup succeeds.
import { createClient } from '@supabase/supabase-js';
import { assertE2ESupabaseApiTarget } from './assert-e2e-supabase-target.mjs';
import { deleteTestUser } from './lib/test-user.mjs';

const fixtures = [
  ['54696b3e-8f3b-44d4-91c9-1155761bf674', 'week-rec-other-1795785218730-cqqq4q@example.test'],
  ['05d8132a-84de-406c-8a6b-2cc175eb8363', 'week-rec-owner-1795785263207-1wg32g@example.test'],
  ['00232b56-1b20-4dd5-86e5-4cef9af53fa0', 'week-rec-other-1795785264636-er8r9y@example.test'],
];
const target = assertE2ESupabaseApiTarget();
const admin = createClient(target.projectUrl, target.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
if (admin.supabaseUrl !== target.projectUrl) throw new Error('Refusing cleanup on a different Supabase client');
for (const [id, email] of fixtures) {
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error?.status === 404) continue;
  if (error || data?.user?.id !== id || data.user.email?.toLowerCase() !== email) {
    throw new Error(`Refusing cleanup because a fixture identity did not match: ${error?.message ?? id}`);
  }
  await deleteTestUser(admin, id, { strict: true });
  console.log(`Cleaned interrupted synthetic speaking fixture ${id}.`);
}
