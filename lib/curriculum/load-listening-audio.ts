import 'server-only';
import { createServerSupabase } from '@/utils/supabase/server';
import { resolveTrialAudio, type PlayableTrial, type TrialRow } from './listening-audio';

/**
 * Reads the approval state for the Weeks 1–4 listening tracks.
 *
 * The table holds no learner data and no answer data: one row per week with the
 * uploaded file URLs, the approval flag and the source of the recording. It is
 * therefore safe to read with the same server client the rest of the learner
 * week uses. Any failure returns an empty list, which resolves to "no audio".
 */
export async function loadTrialAudioRows(): Promise<TrialRow[]> {
  try {
    const client = await createServerSupabase();
    if (!client) return [];
    const { data, error } = await client
      .from('listening_audio_trials')
      .select('week, audio_url, captions_url, source, released');
    if (error || !data) return [];
    return data as TrialRow[];
  } catch {
    return [];
  }
}

export async function loadPlayableTrialAudio(week: number): Promise<PlayableTrial | null> {
  return resolveTrialAudio(week, await loadTrialAudioRows());
}
