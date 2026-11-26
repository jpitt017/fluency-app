import 'server-only';
import { cookies } from 'next/headers';
import { createServerSupabase } from '@/utils/supabase/server';
import { learnerWeekFromParam } from './syllabus';
import { readStoredCurrentWeek } from './stored-current-week';

/** Signed-in progress is authoritative; the browser cookie is only for visitors. */
export async function currentLearnerWeek(): Promise<number> {
  const client = await createServerSupabase();
  if (client) {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError && authError.name !== 'AuthSessionMissingError') {
      console.error('[week] Could not verify user:', authError.message);
      return 1;
    }
    if (user) {
      const week = await readStoredCurrentWeek(client, user.id);
      return learnerWeekFromParam(String(week ?? 1));
    }
  }
  return learnerWeekFromParam((await cookies()).get('learner_week')?.value);
}
