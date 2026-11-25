import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { assertE2ESupabaseTarget } from './assert-e2e-supabase-target.mjs';

/**
 * Prepare only disposable fixtures after migrations have been applied. The
 * configured learner is deleted and recreated after the profile trigger exists,
 * so a dashboard-created user from before migration does not leave the E2E
 * project with an auth user but no learner profile. One minimal writing task is
 * needed by the issue-report E2E case; no production rows are imported.
 */
export async function seedE2ESupabase({ admin, env = process.env }) {
  assertE2ESupabaseTarget(env);
  const email = env.E2E_USER_EMAIL;
  const password = env.E2E_USER_PASSWORD;

  const { data: users, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw new Error(`Could not inspect isolated E2E users: ${listError.message}`);
  const oldUser = users.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (oldUser) {
    const { error } = await admin.auth.admin.deleteUser(oldUser.id);
    if (error) throw new Error(`Could not reset isolated E2E learner: ${error.message}`);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`Could not create the confirmed E2E learner: ${createError?.message ?? 'no user returned'}`);
  }
  if (!created.user.email_confirmed_at || created.user.confirmation_sent_at || created.user.invited_at || created.user.recovery_sent_at) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error('E2E learner was not confirmed without email; refusing to leave the test account behind.');
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('id', created.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error(`The isolated E2E learner profile was not created by the auth trigger${profileError ? `: ${profileError.message}` : ''}`);
  }

  // The signed-in CEFR smoke tests deliberately exercise Week 4. Unlock it for
  // this test user only using the same completion rows the progress RPC reads.
  const outputProgress = [1, 2, 3].flatMap((week_number) => [
    { user_id: created.user.id, week_number, skill: 'speaking' },
    { user_id: created.user.id, week_number, skill: 'writing' },
  ]);
  const inputProgress = [1, 2, 3].map((week_number) => ({
    user_id: created.user.id,
    week_number,
    skill: 'reading',
  }));
  const { error: outputError } = await admin
    .from('week_output_submissions')
    .upsert(outputProgress, { onConflict: 'user_id,week_number,skill' });
  if (outputError) throw new Error(`Could not prepare isolated E2E week progress: ${outputError.message}`);
  const { error: inputError } = await admin
    .from('week_input_submissions')
    .upsert(inputProgress, { onConflict: 'user_id,week_number,skill' });
  if (inputError) throw new Error(`Could not prepare isolated E2E week progress: ${inputError.message}`);

  const { data: existingTask, error: taskReadError } = await admin
    .from('writing_tasks')
    .select('id')
    .limit(1)
    .maybeSingle();
  if (taskReadError) throw new Error(`Could not inspect E2E writing-task fixtures: ${taskReadError.message}`);
  if (!existingTask) {
    const { data: module, error: moduleError } = await admin
      .from('modules')
      .select('id')
      .order('module_number', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (moduleError || !module) {
      throw new Error(`Cannot create the minimal E2E writing-task fixture${moduleError ? `: ${moduleError.message}` : ''}`);
    }
    const { error: taskInsertError } = await admin.from('writing_tasks').insert({
      module_id: module.id,
      title: 'E2E issue-report fixture',
      prompt: 'Write one short sentence for this isolated E2E fixture.',
      format: 'paragraph',
      word_min: 1,
      word_max: 100,
    });
    if (taskInsertError) throw new Error(`Could not create the minimal E2E writing-task fixture: ${taskInsertError.message}`);
  }

  console.log('Isolated E2E learner and minimal writing-task fixture are ready.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const target = assertE2ESupabaseTarget();
    const admin = createClient(target.projectUrl, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await seedE2ESupabase({ admin });
  } catch (error) {
    console.error(`::error title=E2E Supabase fixture setup::${error.message}`);
    process.exitCode = 1;
  }
}
