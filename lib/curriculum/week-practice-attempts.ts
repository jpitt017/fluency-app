import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PracticeAttempt = { item_id: string; answer: unknown; correct: boolean };
export type PracticeAttemptTable = 'week_grammar_attempts' | 'week_vocabulary_attempts';

/** Read every saved attempt oldest first; the last mark for each item wins. */
export async function readPracticeAttempts(
  client: SupabaseClient,
  table: PracticeAttemptTable,
  userId: string,
  week: number,
): Promise<{ rows: PracticeAttempt[]; error: unknown | null }> {
  const rows: PracticeAttempt[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select('item_id, answer, correct')
      .eq('user_id', userId)
      .eq('week_number', week)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return { rows: [], error };
    rows.push(...((data ?? []) as PracticeAttempt[]));
    if (!data || data.length < pageSize) return { rows, error: null };
  }
}
