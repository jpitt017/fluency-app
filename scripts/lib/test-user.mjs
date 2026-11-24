/**
 * Shared helpers for production-safe Supabase test users.
 *
 * Two rules, both for one reason: **a test must never send an auth email.** A
 * test address is fake, so every message sent to it bounces, and a project that
 * keeps bouncing mail gets a high bounce rate and a damaged sending domain.
 * Supabase flags exactly this.
 *
 * 1. Users are created with the **admin API** (`auth.admin.createUser`) and
 *    `email_confirm: true`, so the account is confirmed on creation and no
 *    confirmation mail is queued. Sign-in then works with a password.
 * 2. Nothing in a test may call the public `signUp` (or any other flow that
 *    sends mail: magic link, recovery, invite). Tests sign in with a password,
 *    which sends nothing. `no-auth-email.test.mjs` fails the build if a test or
 *    a check ever calls one of those again.
 */

/** Every auth flow that sends an email. Kept here so the guard and the docs agree. */
export const EMAIL_SENDING_AUTH_CALLS = [
  'signUp',
  'signInWithOtp',
  'resetPasswordForEmail',
  'inviteUserByEmail',
  'resend',
];

/** The public tables a test user can write to, cleared before the profile row. */
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
  'week_vocabulary_attempts',
  'week_grammar_attempts',
  'week_input_answers',
  'week_skill_completions',
  'issue_reports',
  'issue_report_attempts',
  'writing_submissions',
  'xp_events',
];

/**
 * Provision a throwaway learner the admin way: confirmed on creation, so no
 * confirmation email is sent.
 *
 * Returns the password as well as the email, because a test signs in with a
 * password rather than following a link from an inbox.
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
  // Belt and braces: `email_confirm: true` is supposed to queue nothing, so
  // check the user really came back confirmed and with no send timestamp. If
  // the admin API ever changes behaviour, the test fails before mail can bounce.
  const user = data.user;
  if (!user.email_confirmed_at) {
    throw new Error(`Test user ${email} was created without email_confirmed_at; refusing to leave an unconfirmed, email-sending account behind.`);
  }
  if (user.confirmation_sent_at || user.invited_at || user.recovery_sent_at) {
    throw new Error(`Test user ${email} had an auth email queued (confirmation/invite/recovery); the bounce would hit the sending domain. Check auth.admin.createUser settings.`);
  }
  return { id: user.id, email, password };
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
