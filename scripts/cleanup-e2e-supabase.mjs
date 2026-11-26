import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { assertE2ESupabaseTarget } from './assert-e2e-supabase-target.mjs';

/** Delete only the disposable learner created for this exact workflow attempt. */
export async function cleanupE2ESupabase({ admin, env = process.env }) {
  assertE2ESupabaseTarget(env);
  const email = env.E2E_USER_EMAIL.toLowerCase();
  const { data, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw new Error(`Could not locate this run's isolated E2E learner: ${listError.message}`);

  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) {
    console.log(`No isolated learner remains for E2E run ${env.E2E_RUN_ID}, attempt ${env.E2E_RUN_ATTEMPT}.`);
    return;
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) throw new Error(`Could not delete this run's isolated E2E learner: ${deleteError.message}`);
  console.log(`Deleted isolated learner for E2E run ${env.E2E_RUN_ID}, attempt ${env.E2E_RUN_ATTEMPT}.`);
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
