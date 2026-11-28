import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import { createServerSupabase } from '@/utils/supabase/server';
import { practicePlan } from './week-practice-plan';
import { makeWeekProgress } from './week-progress-shape.mjs';

export type WeekTaskKey = 'grammar' | 'vocabulary' | 'reading' | 'listening' | 'speaking' | 'writing';
export type WeekTaskProgress = { done: boolean; itemsAnswered: number; minutes: number };
export type WeekProgress = Record<WeekTaskKey, WeekTaskProgress>;

const EMPTY_PROGRESS: WeekProgress = makeWeekProgress({}) as WeekProgress;

/**
 * Read this learner's six-task progress using their authenticated Supabase
 * client (and therefore the tables' own-row RLS policies). This is the shared
 * source of truth for the /week overview and learner dashboard.
 */
export async function loadWeekProgress(userId: string | null, week: number): Promise<WeekProgress> {
  if (!userId || !Number.isInteger(week) || week < 1 || week > 32) return EMPTY_PROGRESS;
  try {
    const client = await createServerSupabase();
    if (!client) return EMPTY_PROGRESS;
    const { data: auth } = await client.auth.getUser();
    if (auth?.user?.id !== userId) return EMPTY_PROGRESS;

    const [
      grammarResult,
      vocabularyResult,
      inputCompletionResult,
      inputAnswerResult,
      outputResult,
      speakingTakeResult,
      speakingAttemptResult,
      writingResult,
    ] = await Promise.all([
      client.from('week_grammar_attempts').select('item_id').eq('user_id', userId).eq('week_number', week),
      client.from('week_vocabulary_attempts').select('item_id').eq('user_id', userId).eq('week_number', week),
      client.from('week_input_submissions').select('skill').eq('user_id', userId).eq('week_number', week),
      client.from('week_input_answers').select('skill,item_id').eq('user_id', userId).eq('week_number', week),
      client.from('week_output_submissions').select('skill').eq('user_id', userId).eq('week_number', week),
      client.from('week_speaking_takes').select('kind,status').eq('user_id', userId).eq('week_number', week),
      client.from('week_speaking_attempts').select('first_recording_path,second_recording_path').eq('user_id', userId).eq('week_number', week),
      client.from('writing_submissions')
        .select('id,writing_tasks!inner(module_id,modules!inner(week_number))')
        .eq('user_id', userId)
        .eq('status', 'evaluated')
        .eq('writing_tasks.modules.week_number', week),
    ]);

    const content = details as unknown as {
      reading: { weeks: { week: number; questions: { id: string }[] }[] };
      listening: { weeks: { week: number; questions: { id: string }[] }[] };
    };
    const readingDetails = content.reading.weeks.find((entry) => entry.week === week);
    const listeningDetails = content.listening.weeks.find((entry) => entry.week === week);
    const grammarQuestions = practicePlan('grammar', week)?.items.filter((item) => item.counted) ?? [];
    const vocabularyQuestions = practicePlan('vocabulary', week)?.items.filter((item) => item.counted) ?? [];
    const grammarTotal = grammarQuestions.length;
    const vocabularyTotal = vocabularyQuestions.length;
    const speakingTakes = (speakingTakeResult.data ?? []) as { kind: string; status: string }[];
    const legacySpeaking = (speakingAttemptResult.data ?? []) as { first_recording_path: string | null; second_recording_path: string | null }[];
    const keptRecordings = speakingTakes.filter((take) => ['first', 'retry'].includes(take.kind) && take.status === 'ready').length
      + legacySpeaking.reduce((count, row) => count + Number(Boolean(row.first_recording_path)) + Number(Boolean(row.second_recording_path)), 0);

    return makeWeekProgress({
      grammarItemIds: (grammarResult.data ?? []).map((row) => row.item_id),
      vocabularyItemIds: (vocabularyResult.data ?? []).map((row) => row.item_id),
      grammarQuestionIds: grammarQuestions.map((item) => item.id),
      vocabularyQuestionIds: vocabularyQuestions.map((item) => item.id),
      inputSubmissions: inputCompletionResult.data ?? [],
      inputAnswers: inputAnswerResult.data ?? [],
      outputSubmissions: outputResult.data ?? [],
      speakingRecordings: keptRecordings,
      writingSubmissions: writingResult.data?.length ?? 0,
      readingQuestionIds: readingDetails?.questions.map((question) => question.id) ?? [],
      listeningQuestionIds: listeningDetails?.questions.map((question) => question.id) ?? [],
      readingTotal: readingDetails?.questions.length ?? 0,
      listeningTotal: listeningDetails?.questions.length ?? 0,
      grammarTotal,
      vocabularyTotal,
    }) as WeekProgress;
  } catch (error) {
    console.error('[week-progress] Could not load weekly progress:', error);
    return EMPTY_PROGRESS;
  }
}
