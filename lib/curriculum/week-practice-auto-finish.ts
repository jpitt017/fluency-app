import 'server-only';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { createServerSupabase } from '@/utils/supabase/server';
import { practicePlan } from './week-practice-plan';
import { readPracticeAttempts } from './week-practice-attempts';
import { finishPractice } from './week-practice-finish';
import { finishAnsweredPracticeSummaries } from './week-practice-auto-finish.mjs';

/**
 * On a signed-in learner's next dashboard or week visit, create the saved
 * summary and Review handoff if every required item was checked but Finish was
 * never pressed. Existing snapshots are left untouched; the database's unique
 * keys make repeated or concurrent visits safe.
 */
export async function ensureWeeklyPracticeSummary(week: number): Promise<void> {
  if (!Number.isInteger(week) || week < 1 || week > 32) return;
  try {
    const client = await createServerSupabase();
    if (!client) return;
    const { data: auth } = await client.auth.getUser();
    const user = auth?.user;
    if (!user) return;
    const admin = createAdminSupabase();
    if (!admin) return;

    await finishAnsweredPracticeSummaries({
      week,
      userId: user.id,
      client,
      admin,
      plans: {
        grammar: practicePlan('grammar', week),
        vocabulary: practicePlan('vocabulary', week),
      },
      readAttempts: readPracticeAttempts,
      finishPractice,
    });
  } catch (error) {
    // Rendering stays available. Since no snapshot was written on failure, the
    // next dashboard/week visit retries the same idempotent operation.
    console.error('[week-practice-auto-finish] Could not prepare Review summary:', error);
  }
}
