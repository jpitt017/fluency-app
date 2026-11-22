/** Shared helpers for production-safe Supabase test users. */

const USER_TABLES = [
  'ai_request_logs',
  'ai_usage_events',
  'ai_usage_resets',
  'pilot_learners',
  'checkpoint_attempts',
  'curriculum_preferences',
  'daily_sessions',
  'enrollments',
  'error_review_cards',
  'learner_errors',
  'lesson_progress',
  'mediation_attempts',
  'practice_attempts',
  'skill_levels',
  'speaking_attempts',
  'subscriptions',
  'user_badges',
  'vocab_cards',
  'vocab_reviews',
  'weekly_reports',
  'week_output_submissions',
  'week_input_submissions',
  'issue_reports',
  'issue_report_attempts',
  'writing_submissions',
  'xp_events',
];

/**
 * Provision a throwaway learner. Production tests must only use @example.test
 * addresses and must skip the confirmation email via email_confirm: true.
 */
export async function createTestUser(admin, prefix) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = `Test!${Math.random().toString(36).slice(2)}${Date.now()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Could not create ${email}: ${error?.message ?? 'no user returned'}`);
  return { id: data.user.id, email, password };
}

/** Remove every row linked to a test user, then delete the auth user itself. */
export async function deleteTestUser(admin, id) {
  if (!id) return;
  const files = await admin.storage.from('issue-attachments').list(id, { limit: 1000 });
  if (!files.error && files.data?.length) await admin.storage.from('issue-attachments').remove(files.data.map((file) => `${id}/${file.name}`));
  for (const table of USER_TABLES) {
    // Some deployments may not have every optional table; ignore "not found".
    const { error } = await admin.from(table).delete().eq('user_id', id);
    if (error && !/does not exist|could not find the table/i.test(error.message)) {
      console.warn(`Could not clear ${table} for test user ${id}: ${error.message}`);
    }
  }
  await admin.from('profiles').delete().eq('id', id);
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw new Error(`Could not delete test user ${id}: ${error.message}`);
}
