import 'server-only';
import { cookies } from 'next/headers';
import { createServerSupabase } from '@/utils/supabase/server';
import { learnerWeekFromParam } from './syllabus';

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
      const { data, error } = await client.rpc('refresh_current_week');
      if (error) {
        console.error('[week] Could not calculate progress:', error.message);
        const profile = await client.from('profiles').select('current_week').eq('id', user.id).maybeSingle();
        return learnerWeekFromParam(String(profile.data?.current_week ?? 1));
      }
      return learnerWeekFromParam(String(data));
    }
  }
  return learnerWeekFromParam((await cookies()).get('learner_week')?.value);
}
