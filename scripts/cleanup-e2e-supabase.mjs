import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { assertE2ESupabaseTarget } from './assert-e2e-supabase-target.mjs';
import { deleteTestUser } from './lib/test-user.mjs';
import { e2eFixtureScope, isE2EFixture } from './lib/e2e-fixture-scope.mjs';

/** Delete the seeded learner and tagged fixtures from this exact isolated run. */
export async function cleanupE2ESupabase({ admin, env = process.env, cleanupUser = deleteTestUser }) {
  const target = assertE2ESupabaseTarget(env);
  if (admin.supabaseUrl !== target.projectUrl) throw new Error('Refusing cleanup on a different Supabase client');
  const scope = e2eFixtureScope(env);
  const seedEmail = env.E2E_USER_EMAIL.toLowerCase();
  const users = [];
  // Collect all candidates before deleting; deleting while paginating can
  // shift later users onto earlier pages and leave fixtures behind.
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !Array.isArray(data?.users)) throw new Error(`Could not locate isolated E2E users: ${error?.message ?? 'invalid response'}`);
    users.push(...data.users);
    if (data.users.length < 1000) break;
    if (page >= 1000) throw new Error('Too many E2E users to safely enumerate');
  }
  const candidates = users.filter((user) => user.email?.toLowerCase() === seedEmail || isE2EFixture(user, scope));
  const failures = [];
  for (const user of candidates) {
    try {
      if (typeof user.id !== 'string' || !user.id) throw new Error('A matching fixture has no user ID');
      // Includes private Storage before deleting auth, and fails closed if any
      // bucket or row could not be cleaned so the user stays discoverable.
      await cleanupUser(admin, user.id, { strict: true });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length) throw new Error(`Could not clean ${failures.length} isolated E2E user(s): ${failures.join('; ')}`);
  console.log(`Cleaned ${candidates.length} isolated E2E user(s) for run ${scope.runId}, attempt ${scope.runAttempt}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const target = assertE2ESupabaseTarget();
    const admin = createClient(target.projectUrl, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await cleanupE2ESupabase({ admin });
  } catch (error) {
    console.error(`::error title=E2E Supabase cleanup::${error.message}`);
    process.exitCode = 1;
  }
}
