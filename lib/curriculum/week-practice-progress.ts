import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import { createServerSupabase } from '@/utils/supabase/server';
import { learnerGrammar } from './learner-grammar';
import { learnerVocabularyExercises } from './learner-vocabulary-exercises';
import { practicePlan, type PracticePlan } from './week-practice-plan';
import {
  practiceCounts,
  resumeStep,
  summarySentence,
  unmarkedRequired,
} from './week-practice.mjs';

/**
 * The saved grammar and vocabulary answers for one week, read on the server so
 * the page can be rendered from them rather than from the browser's memory.
 *
 * Two things this deliberately does not send:
 *
 *   - answer keys. Every item keeps the projection the first render already
 *     uses: no `key` or `accepted`. A reason is attached only to a row this
 *     learner already has, so a reloaded page repeats the feedback they already
 *     saw rather than handing over every answer for the week;
 *   - trust in the browser's count. `canFinish` is computed here from the saved
 *     rows, and the finish route computes it again from the same rows.
 */

/** One saved answer, in the shape `marked` already had in the components. */
export type SavedAnswer = { answer: string; correct: boolean; reason: string | null };

export type CompletionSummary = {
  correct: number;
  total: number;
  reviewMistakes: number;
  /** The B1 sentence the learner read when they finished, repeated verbatim. */
  sentence: string;
  /** Which task the finishing button points at. */
  next: 'vocabulary' | 'reading';
};

export type PracticeProgress = {
  /** itemId -> the saved answer and mark. */
  answers: Record<string, SavedAnswer>;
  /** The step the page opens on: the first required gap, or the last step. */
  step: number;
  /** Nothing required is missing. The route decides again; this is the button. */
  canFinish: boolean;
  /** How many required questions are still unanswered. */
  remaining: number;
  /** Null unless a completion record exists for this learner and week. */
  summary: CompletionSummary | null;
};

export type WeekPracticeProgress = {
  signedIn: boolean;
  grammar: PracticeProgress | null;
  vocabulary: PracticeProgress | null;
};

const SIGNED_OUT: WeekPracticeProgress = { signedIn: false, grammar: null, vocabulary: null };

type Client = Awaited<ReturnType<typeof createServerSupabase>>;

type Row = { item_id: string; answer: unknown; correct: boolean };
type CompletionRow = {
  skill: string;
  correct: number;
  total: number;
  review_count: number;
};

/** Every saved row for one week, oldest first, so the latest answer wins. */
async function readRows(
  client: NonNullable<Client>,
  table: 'week_grammar_attempts' | 'week_vocabulary_attempts',
  userId: string,
  week: number,
): Promise<Row[]> {
  const rows: Row[] = [];
  const pageSize = 500;
  for (let from = 0; from < 5000; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select('item_id, answer, correct')
      .eq('user_id', userId)
      .eq('week_number', week)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return rows;
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/**
 * The authored reason for each grammar item, so an item restored from the
 * server shows the same sentence it showed when the learner checked it.
 *
 * Read here, on the server, and sent only for rows the learner already has.
 */
function grammarReasons(week: number): Map<string, string | null> {
  const items = details.weeks.find((entry) => entry.number === week)?.grammar.practice.items ?? [];
  return new Map(items.map((item) => [item.id as string, (item.reason as string | undefined) ?? null]));
}

export async function loadWeekPracticeProgress(week: number): Promise<WeekPracticeProgress> {
  let client: Client = null;
  try {
    client = await createServerSupabase();
  } catch {
    // Signed out, or no Supabase configured: the page still renders.
    return SIGNED_OUT;
  }
  if (!client) return SIGNED_OUT;
  const { data: auth } = await client.auth.getUser();
  const user = auth?.user;
  if (!user) return SIGNED_OUT;

  const grammar = learnerGrammar(week) ? practicePlan('grammar', week) : null;
  const vocabulary = learnerVocabularyExercises(week) ? practicePlan('vocabulary', week) : null;

  const [grammarRows, vocabularyRows, completions] = await Promise.all([
    grammar ? readRows(client, 'week_grammar_attempts', user.id, week) : Promise.resolve([]),
    vocabulary ? readRows(client, 'week_vocabulary_attempts', user.id, week) : Promise.resolve([]),
    client
      .from('week_skill_completions')
      .select('skill, correct, total, review_count')
      .eq('user_id', user.id)
      .eq('week_number', week),
  ]);

  const completionRows = (completions.error ? [] : (completions.data ?? [])) as CompletionRow[];
  const hasVocabulary = Boolean(vocabulary);

  return {
    signedIn: true,
    grammar: grammar
      ? progressFor({
          plan: grammar,
          rows: grammarRows,
          reasons: grammarReasons(week),
          completion: completionRows.find((row) => row.skill === 'grammar'),
          next: hasVocabulary ? 'vocabulary' : 'reading',
        })
      : null,
    vocabulary: vocabulary
      ? progressFor({
          plan: vocabulary,
          rows: vocabularyRows,
          completion: completionRows.find((row) => row.skill === 'vocabulary'),
          next: 'reading',
          // The authored feedback for a fixed item, so a restored answer shows
          // the line it showed when it was checked. Only rows this learner
          // already has are sent with it.
          feedback: new Map(
            vocabulary.items
              .filter((item) => typeof item.feedback === 'string')
              .map((item) => [item.id, item.feedback as string]),
          ),
        })
      : null,
  };
}

function progressFor({
  plan,
  rows,
  reasons,
  feedback,
  completion,
  next,
}: {
  plan: PracticePlan;
  rows: Row[];
  reasons?: Map<string, string | null>;
  feedback?: Map<string, string>;
  completion: CompletionRow | undefined;
  next: CompletionSummary['next'];
}): PracticeProgress {
  const known = new Set(plan.items.map((item) => item.id));
  const answers: Record<string, SavedAnswer> = {};
  for (const row of rows) {
    // Ascending order, so a later attempt replaces an earlier one: the learner
    // sees what they last answered, not their first try.
    if (!known.has(row.item_id)) continue;
    answers[row.item_id] = {
      answer: typeof row.answer === 'string' ? row.answer : '',
      correct: row.correct,
      reason: reasons?.get(row.item_id) ?? feedback?.get(row.item_id) ?? null,
    };
  }
  const results = Object.fromEntries(
    Object.entries(answers).map(([id, saved]) => [id, saved.correct]),
  ) as Record<string, boolean>;
  const remaining = unmarkedRequired(plan.items, results).length;

  return {
    answers,
    step: resumeStep(plan.steps, results),
    canFinish: remaining === 0,
    remaining,
    summary: completion
      ? {
          correct: completion.correct,
          total: completion.total || practiceCounts(plan.items, results).total,
          reviewMistakes: completion.review_count,
          sentence: summarySentence({
            correct: completion.correct,
            total: completion.total || practiceCounts(plan.items, results).total,
            reviewMistakes: completion.review_count,
          }),
          next,
        }
      : null,
  };
}
