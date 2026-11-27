import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import speakingSupport from '../../supabase-b1-b2/content/curriculum/speaking-support-weeks-01-04.json';
import { createServerSupabase } from '@/utils/supabase/server';
import { publicSpeakingSupport } from './speaking-support.mjs';
import { weekSpeakingAttemptRecordings, weekSpeakingTakeRecording } from '@/lib/b1b2/week-speaking-recordings.mjs';
import { soundTips, structurePoint, type ShortSpeakingFeedback } from '@/lib/b1b2/speaking-feedback.mjs';

export type ModelPart = { text: string; cuePoints: string[]; purpose: string };
type Config = { week: number; noticePhrases: string[]; planNotes: string[]; retryGoal: string; modelParts: ModelPart[] };
const pilot = speakingSupport as { weeks: Config[] };

export function speakingSupportConfig(weekNumber: number): Config | null {
  return pilot.weeks.find((item) => item.week === weekNumber) ?? null;
}
export function speakingSupportLabels(weekNumber: number) { return speakingSupportConfig(weekNumber)?.planNotes ?? null; }

type SavedAttempt = {
  id: string; user_id: string; week_number: number;
  notes: { label: string; note: string }[] | null;
  first_recording_path: string | null; first_transcript: string | null; first_feedback: Record<string, unknown> | null;
  second_recording_path: string | null; second_transcript: string | null; second_feedback: Record<string, unknown> | null;
};
type Flow = {
  attempt_id: string; first_take_id: string | null; first_versions: number; retry_count: number;
  checks_used: number; model_unlocked: boolean; active_upload_id: string | null; active_check_id: string | null; active_since: string | null;
};
type Take = {
  id: string; user_id: string; week_number: number; attempt_id: string; kind: 'first' | 'retry' | 'structure';
  sequence: number; source_take_id: string | null; recording_path: string; status: string;
  transcript: string | null; feedback: Record<string, unknown> | null; selected_phrases: string[] | null;
};

export type WeekTake = {
  id: string | null; sequence: number; status: string; transcript: string | null;
  feedback: ShortSpeakingFeedback | null; selectedPhrases: string[]; href: string | null; canMoveOn: boolean;
  practice: { id: string; status: string; transcript: string | null; used: boolean | null } | null;
};

function feedbackFor(value: Record<string, unknown> | null, transcript: string | null, week: number, legacy = false): ShortSpeakingFeedback | null {
  if (!transcript) return null;
  if (legacy) {
    // Older scores could include an AI's imagined pronunciation or fluency.
    // Do not relabel them as content-and-grammar scores; keep playback and
    // generate only the new transcript-grounded practice suggestions.
    return { transcript, structure: structurePoint(value?.structure, transcript, week), soundTips: soundTips(transcript) };
  }
  return {
    ...(value as ShortSpeakingFeedback | null), transcript,
    structure: value?.structure ? value.structure as ShortSpeakingFeedback['structure'] : structurePoint(null, transcript, week),
    soundTips: Array.isArray(value?.soundTips) ? value.soundTips as ShortSpeakingFeedback['soundTips'] : soundTips(transcript),
  };
}

/** All returned URLs are app routes; raw private Storage keys never enter the page. */
export async function loadWeekSpeakingSupport(weekNumber: number) {
  const config = speakingSupportConfig(weekNumber);
  const staticWeek = details.weeks.find((item) => item.number === weekNumber);
  if (!config || !staticWeek) return null;
  const projection = publicSpeakingSupport(config);
  if (!projection) return null;
  let attempt: SavedAttempt | null = null;
  let flow: Flow | null = null;
  let takes: Take[] = [];
  let failedTakeIds = new Set<string>();
  let weekRecorded: boolean | null = null;
  let available = true;
  try {
    const client = await createServerSupabase();
    const user = client ? (await client.auth.getUser()).data.user : null;
    if (client && user) {
      const completion = await client.from('week_output_submissions').select('skill')
        .eq('user_id', user.id).eq('week_number', weekNumber).eq('skill', 'speaking').maybeSingle();
      if (completion.error) available = false;
      else weekRecorded = Boolean(completion.data);
      const state = await client.from('week_speaking_flows')
        .select('attempt_id,first_take_id,first_versions,retry_count,checks_used,model_unlocked,active_upload_id,active_check_id,active_since')
        .eq('user_id', user.id).eq('week_number', weekNumber).maybeSingle();
      if (state.error) available = false;
      else if (state.data) {
        flow = state.data as Flow;
        const [saved, takeRows, checkRows] = await Promise.all([
          client.from('week_speaking_attempts').select('id,user_id,week_number,notes,first_recording_path,first_transcript,first_feedback,second_recording_path,second_transcript,second_feedback')
            .eq('id', flow.attempt_id).eq('user_id', user.id).maybeSingle(),
          // Failed upload reservations are kept for deletion but are not
          // playable. Filter them before PostgREST's row limit so many failed
          // uploads cannot hide the small, bounded set of saved recordings.
          client.from('week_speaking_takes').select('id,user_id,week_number,attempt_id,kind,sequence,source_take_id,recording_path,status,transcript,feedback,selected_phrases')
            .eq('user_id', user.id).eq('week_number', weekNumber).in('status', ['ready', 'checking', 'checked', 'abandoned']).order('created_at', { ascending: true }),
          client.from('week_speaking_checks').select('take_id,status').eq('user_id', user.id).eq('week_number', weekNumber).eq('status', 'failed'),
        ]);
        if (saved.error || takeRows.error || checkRows.error || !saved.data) available = false;
        else {
          attempt = saved.data as SavedAttempt;
          takes = (takeRows.data ?? []) as Take[];
          failedTakeIds = new Set((checkRows.data ?? []).map((row) => String(row.take_id)));
        }
      } else {
        // A 0060 app instance may save an attempt after the migration backfill
        // but before deployment. Show it without exposing keys; the first new
        // capture atomically adopts it in reserve_week_speaking_take.
        const legacy = await client.from('week_speaking_attempts')
          .select('id,user_id,week_number,notes,first_recording_path,first_transcript,first_feedback,second_recording_path,second_transcript,second_feedback')
          .eq('user_id', user.id).eq('week_number', weekNumber).order('created_at', { ascending: false }).order('id', { ascending: false });
        if (legacy.error) available = false;
        else {
          const rows = (legacy.data ?? []) as SavedAttempt[];
          attempt = rows.find((row) => Boolean(row.first_recording_path && row.first_transcript)) ?? null;
          if (attempt) flow = {
            attempt_id: attempt.id, first_take_id: null, first_versions: 1,
            retry_count: attempt.second_recording_path ? 1 : 0,
            checks_used: Math.min(5, rows.reduce((total, row) => total + Number(Boolean(row.first_recording_path)) + Number(Boolean(row.second_recording_path)), 0)),
            model_unlocked: true, active_upload_id: null, active_check_id: null, active_since: null,
          };
        }
      }
    } else if (!client) available = false;
  } catch { available = false; }

  const unlocked = Boolean(flow?.model_unlocked && attempt?.first_recording_path && attempt.first_transcript);
  const modelAudioUrl = (staticWeek.speaking as typeof staticWeek.speaking & { audioUrl?: string }).audioUrl ?? null;
  const visibleTakes = takes.filter((take) => ['ready', 'checking', 'checked', 'abandoned'].includes(take.status));
  function project(take: Take): WeekTake {
    const practice = visibleTakes.find((item) => item.kind === 'structure' && item.source_take_id === take.id);
    return {
      id: take.id, sequence: take.sequence, status: take.status, transcript: take.transcript,
      feedback: feedbackFor(take.feedback, take.transcript, weekNumber), selectedPhrases: take.selected_phrases ?? [],
      href: weekSpeakingTakeRecording(take)?.href ?? null,
      canMoveOn: take.kind === 'retry' && take.status === 'ready' && failedTakeIds.has(take.id),
      practice: practice ? { id: practice.id, status: practice.status, transcript: practice.transcript,
        used: typeof practice.feedback?.used === 'boolean' ? practice.feedback.used : null } : null,
    };
  }
  const first = visibleTakes.find((take) => take.id === flow?.first_take_id);
  const legacyFirst: WeekTake | null = unlocked && !first && attempt?.first_transcript ? {
    id: null, sequence: 1, status: 'checked', transcript: attempt.first_transcript,
    feedback: feedbackFor(attempt.first_feedback, attempt.first_transcript, weekNumber, true), selectedPhrases: [],
    href: weekSpeakingAttemptRecordings(attempt)[0]?.href ?? null, canMoveOn: false, practice: null,
  } : null;
  const legacyRetry: WeekTake[] = unlocked && attempt?.second_recording_path && attempt.second_transcript ? [{
    id: null, sequence: 1, status: 'checked', transcript: attempt.second_transcript,
    feedback: feedbackFor(attempt.second_feedback, attempt.second_transcript, weekNumber, true), selectedPhrases: [],
    href: weekSpeakingAttemptRecordings(attempt).find((recording) => recording.takeNumber === 2)?.href ?? null, canMoveOn: false, practice: null,
  }] : [];
  const recordings = [
    ...weekSpeakingAttemptRecordings(attempt),
    ...visibleTakes.map(weekSpeakingTakeRecording).filter((recording): recording is NonNullable<typeof recording> => Boolean(recording)),
  ];
  return {
    ...projection, available, weekRecorded, attemptId: attempt?.id ?? null, notes: attempt?.notes ?? null,
    first: first ? project(first) : legacyFirst,
    tries: [...legacyRetry, ...visibleTakes.filter((take) => take.kind === 'retry').map(project)],
    firstVersions: flow?.first_versions ?? 0, retryCount: flow?.retry_count ?? 0, checksUsed: flow?.checks_used ?? 0,
    // After the 30-minute lease, a new POST recovers a crashed worker under
    // the database lock. Do not leave the UI permanently disabled on reload.
    pending: Boolean((flow?.active_upload_id || flow?.active_check_id)
      && (!flow.active_since || Date.now() - Date.parse(flow.active_since) < 31 * 60_000)), recordings,
    // A new kept first take and completion are committed together; legacy
    // attempts may predate that guarantee. Preserve their model access but
    // report completion independently through weekRecorded above.
    model: unlocked ? { text: staticWeek.speaking.model, audioUrl: modelAudioUrl, parts: config.modelParts } : null,
    unlocked, usefulPhrases: unlocked ? config.noticePhrases : [], retryGoal: config.retryGoal,
  };
}
