import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { practicePlan, type PracticePlan } from './week-practice-plan';
import { readPracticeAttempts, type PracticeAttemptTable } from './week-practice-attempts';
import { readStoredCurrentWeek } from './stored-current-week';
import { effectiveGrammarMark } from './week-grammar-saved-mark';
import { updateReviewFromWeeklyPractice } from '@/lib/b1b2/week-vocab-review';
import { practiceErrorCard } from './week-practice-review.mjs';
import { canFinish, practiceCounts, summarySentence, unmarkedRequired } from './week-practice.mjs';

/**
 * Finish from saved server marks, never from numbers supplied by the browser.
 * A partial practice is a valid finish once at least one fixed question has
 * been checked. The completion is a snapshot; finishing again replaces it.
 */
export type FinishSkill = 'grammar' | 'vocabulary';

export type FinishResult =
  | {
      ok: true;
      summary: {
        answered: number;
        correct: number;
        wrong: number;
        total: number;
        reviewMistakes: number;
        sentence: string;
      };
    }
  | { ok: false; status: number; error: string; remaining?: number };

const TABLES: Record<FinishSkill, PracticeAttemptTable> = {
  grammar: 'week_grammar_attempts',
  vocabulary: 'week_vocabulary_attempts',
};

/**
 * Ensure each checked fixed-answer mistake has a Review card. Unanswered and
 * optional items never get cards here. A duplicate already exists in Review;
 * it is not another mistake or another new card. Vocabulary questions tied to
 * an authored word use that word's card. Verb/word-form questions have no such
 * term, so they get sentence-repair cards rather than guessed vocabulary aliases.
 */
async function addMistakesToReview({
  admin,
  userId,
  skill,
  plan,
  results,
  answers,
}: {
  admin: SupabaseClient;
  userId: string;
  skill: FinishSkill;
  plan: PracticePlan;
  results: Record<string, boolean>;
  answers: Record<string, unknown>;
}): Promise<boolean> {
  const mistakes = plan.items.filter((item) => item.counted && results[item.id] === false);
  const updatedTerms = new Set<string>();

  for (const item of mistakes) {
    if (skill === 'vocabulary' && item.term) {
      const term = item.term.trim().toLocaleLowerCase('en-GB');
      if (!updatedTerms.has(term)) {
        const { updated } = await updateReviewFromWeeklyPractice(admin, userId, item.term, false, new Date(), { ensureOnly: true });
        if (!updated) return false;
        updatedTerms.add(term);
      }
      continue;
    }

    const card = practiceErrorCard({
      userId,
      item,
      answer: answers[item.id],
      category: skill === 'grammar' ? 'tense' : 'collocation',
    });
    if (!card) {
      console.error('[week-finish] Missing Review answer for a checked practice item:', item.id);
      return false;
    }
    const { error } = await admin.from('error_review_cards').insert(card);
    if (error && error.code !== '23505') {
      console.error('[week-finish] Could not add a mistake to Review:', error.message);
      return false;
    }
  }
  return true;
}

export async function finishPractice({
  admin,
  userId,
  skill,
  week,
  client,
}: {
  admin: SupabaseClient;
  userId: string;
  skill: FinishSkill;
  week: number;
  /** The learner's own client, used only to check the week is open. */
  client: SupabaseClient;
}): Promise<FinishResult> {
  const plan = practicePlan(skill, week);
  if (!plan || !plan.items.length) {
    return { ok: false, status: 404, error: 'This practice is not available.' };
  }

  const current = await readStoredCurrentWeek(client, userId);
  if (current === null) return { ok: false, status: 503, error: 'Could not check your progress.' };
  if (week > current) return { ok: false, status: 403, error: 'This week is not open yet.' };

  const { rows, error } = await readPracticeAttempts(admin, TABLES[skill], userId, week);
  if (error) return { ok: false, status: 503, error: 'Could not read your answers.' };

  const known = new Set(plan.items.map((item) => item.id));
  const results: Record<string, boolean> = {};
  const answers: Record<string, unknown> = {};
  for (const row of rows) {
    if (!known.has(row.item_id) || typeof row.correct !== 'boolean') continue;
    results[row.item_id] = skill === 'grammar'
      ? effectiveGrammarMark(week, row.item_id, row.answer, row.correct)
      : row.correct;
    answers[row.item_id] = row.answer;
  }

  if (!canFinish(plan.items, results)) {
    return {
      ok: false,
      status: 400,
      error: 'Answer and check at least 1 question to finish.',
      remaining: unmarkedRequired(plan.items, results).length,
    };
  }

  const counts = practiceCounts(plan.items, results);
  const reviewReady = await addMistakesToReview({ admin, userId, skill, plan, results, answers });
  if (!reviewReady) {
    return {
      ok: false,
      status: 503,
      error: 'Your answers are saved, but we could not add your mistakes to Review. Please try again.',
    };
  }
  const sentence = summarySentence({ ...counts, skill });

  const { error: saveError } = await admin.from('week_skill_completions').upsert(
    {
      user_id: userId,
      week_number: week,
      skill,
      answered: counts.answered,
      correct: counts.correct,
      total: counts.total,
      // Number of answered mistakes represented in Review, not new card inserts.
      review_count: counts.wrong,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,week_number,skill' },
  );
  if (saveError) {
    console.error('[week-finish] Could not save the completion:', saveError.message);
    return { ok: false, status: 503, error: 'Could not save your progress. Please try again.' };
  }

  return { ok: true, summary: { ...counts, reviewMistakes: counts.wrong, sentence } };
}
