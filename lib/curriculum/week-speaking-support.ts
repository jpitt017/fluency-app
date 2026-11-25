import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import speakingSupport from '../../supabase-b1-b2/content/curriculum/speaking-support-weeks-01-04.json';
import { createServerSupabase } from '@/utils/supabase/server';
import { publicSpeakingSupport } from './speaking-support.mjs';

const pilot = speakingSupport as {
  weeks: { week: number; noticePhrases: string[]; planNotes: string[]; retryGoal: string }[];
};

type SavedAttempt = {
  id: string;
  notes: { label: string; note: string }[] | null;
  first_recording_path: string | null;
  first_transcript: string | null;
  first_feedback: Record<string, unknown> | null;
  second_recording_path: string | null;
  second_transcript: string | null;
  second_feedback: Record<string, unknown> | null;
};

export async function loadWeekSpeakingSupport(weekNumber: number) {
  const config = pilot.weeks.find((item) => item.week === weekNumber);
  const staticWeek = details.weeks.find((item) => item.number === weekNumber);
  if (!config || !staticWeek) return null;
  const projection = publicSpeakingSupport(config);
  if (!projection) return null;

  let attempt: SavedAttempt | null = null;
  try {
    const client = await createServerSupabase();
    const user = client ? (await client.auth.getUser()).data.user : null;
    if (client && user) {
      const result = await client.from('week_speaking_attempts')
        .select('id,notes,first_recording_path,first_transcript,first_feedback,second_recording_path,second_transcript,second_feedback')
        .eq('user_id', user.id).eq('week_number', weekNumber).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!result.error && result.data) attempt = result.data as SavedAttempt;
    }
  } catch {
    // A missing/offline database keeps the model hidden and the blank plan usable.
  }

  const unlocked = Boolean(attempt?.first_recording_path && attempt.first_transcript);
  const modelAudioUrl = (staticWeek.speaking as typeof staticWeek.speaking & { audioUrl?: string }).audioUrl ?? null;
  return {
    ...projection,
    attemptId: attempt?.id ?? null,
    notes: attempt?.notes ?? null,
    firstTranscript: unlocked ? attempt?.first_transcript ?? null : null,
    firstFeedback: unlocked ? attempt?.first_feedback ?? null : null,
    secondTranscript: attempt?.second_recording_path ? attempt.second_transcript : null,
    secondFeedback: attempt?.second_recording_path ? attempt.second_feedback : null,
    // The model and its audio URL are projected only after the server observes
    // a saved first recording. Neither is present in the locked page payload.
    model: unlocked ? { text: staticWeek.speaking.model, audioUrl: modelAudioUrl } : null,
    unlocked,
    usefulPhrases: unlocked ? config.noticePhrases : [],
    retryGoal: config.retryGoal,
  };
}

export function speakingSupportLabels(weekNumber: number) {
  return pilot.weeks.find((item) => item.week === weekNumber)?.planNotes ?? null;
}
