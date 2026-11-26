import type { SupabaseClient } from '@supabase/supabase-js';

/** Read the last visit's computed progress without locking or recomputing it. */
export async function readStoredCurrentWeek(client: SupabaseClient, userId: string): Promise<number | null> {
  try {
    const { data, error } = await client.from('profiles').select('current_week').eq('id', userId).maybeSingle();
    if (error || !data || !Number.isInteger(data.current_week)) return null;
    const week = Number(data.current_week);
    return week >= 1 && week <= 32 ? week : null;
  } catch {
    return null;
  }
}
