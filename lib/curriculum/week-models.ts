import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { createServerSupabase } from '@/utils/supabase/server';

type Skill = 'speaking' | 'writing';

function modelFor(weekNumber: number, skill: Skill): string | null {
  const week = details.weeks.find((entry) => entry.number === weekNumber);
  return (skill === 'speaking' ? week?.speaking.model : week?.writing.modelAnswer) || null;
}

/** Called only after an authenticated, successfully evaluated submission. */
export async function recordWeekSubmission(userId: string, weekNumber: unknown, skill: Skill): Promise<string | null> {
  if (!Number.isInteger(weekNumber)) return null;
  const week = weekNumber as number;
  const model = modelFor(week, skill);
  if (!model) return null;
  try {
    const admin = createAdminSupabase();
    if (!admin) {
      console.error('[week] Could not record submission: admin client is not configured');
      return null;
    }
    const { error } = await admin.from('week_output_submissions').upsert(
      { user_id: userId, week_number: week, skill },
      { onConflict: 'user_id,week_number,skill', ignoreDuplicates: true },
    );
    if (error) {
      console.error('[week] Failed to record submission:', error);
      return null;
    }
  } catch (error) {
    console.error('[week] Failed to record submission:', error);
    return null;
  }
  // Progress is recomputed by the next explicit page visit, never on task POSTs.
  return model;
}

/** Read models only for the authenticated learner's previously submitted tasks. */
export async function loadUnlockedModels(week: number): Promise<{ speaking: string | null; writing: string | null }> {
  const locked = { speaking: null, writing: null };
  const client = await createServerSupabase();
  if (!client) return locked;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return locked;
  const { data, error } = await client.from('week_output_submissions').select('skill').eq('user_id', user.id).eq('week_number', week);
  if (error || !data) return locked;
  return {
    speaking: data.some((row) => row.skill === 'speaking') ? modelFor(week, 'speaking') : null,
    writing: data.some((row) => row.skill === 'writing') ? modelFor(week, 'writing') : null,
  };
}

/**
 * Which output skills have a saved submission for this week. This is the
 * week overview's "done" signal for the writing task (the speaking task reads
 * its own saved recordings), so it reports the saved rows themselves and does
 * not depend on a model answer being authored.
 */
export async function loadWeekOutputSubmissions(week: number): Promise<{ speaking: boolean; writing: boolean }> {
  const done = { speaking: false, writing: false };
  const client = await createServerSupabase();
  if (!client) return done;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return done;
  const { data, error } = await client.from('week_output_submissions').select('skill').eq('user_id', user.id).eq('week_number', week);
  if (error || !data) return done;
  return {
    speaking: data.some((row) => row.skill === 'speaking'),
    writing: data.some((row) => row.skill === 'writing'),
  };
}
