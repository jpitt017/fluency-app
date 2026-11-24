import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { practicePlan } from './week-practice-plan';
import { updateReviewFromWeeklyPractice } from '@/lib/b1b2/week-vocab-review';
import {
  canFinish,
  practiceCounts,
  summarySentence,
  unmarkedRequired,
} from './week-practice.mjs';

/**
 * Finishing one practice section: record the completion, and put the mistakes
 * in Review.
 *
 * Everything here is decided from the rows the marking routes already wrote.
 * The request body carries no count, and a count sent from the browser is
 * ignored: a learner cannot award themselves "18 of 22" by editing a request.
 *
 * The same function produces the sentence the learner reads on the page and the
 * sentence stored against the completion, so the summary after a reload is the
 * one they finished with rather than a second, possibly different, calculation.
 */

export type FinishSkill = 'grammar' | 'vocabulary';

export type FinishResult =
  | {
      ok: true;
      summary: {
        correct: number;
        total: number;
        reviewMistakes: number;
        sentence: string;
      };
    }
  | { ok: false; status: number; error: string; remaining?: number };

type Row = { item_id: string; answer: unknown; correct: boolean };

const TABLES: Record<FinishSkill, 'week_grammar_attempts' | 'week_vocabulary_attempts'> = {
  grammar: 'week_grammar_attempts',
  vocabulary: 'week_vocabulary_attempts',
};

/**
 * A Review card for every fixed-answer mistake.
 *
 * Grammar mistakes are stored as a repair card ("fix this sentence"), which is
 * exactly what the Review page offers. Vocabulary mistakes are not: a wrong
 * option says nothing about a sentence to repair, so those go through the same
 * FSRS path the marking route already uses for the word itself. Both are
 * deduplicated -- the grammar insert relies on the unique
 * (user_id, category, normalized_key) index, the vocabulary update on the
 * existing card -- so finishing twice does not double a learner's queue.
 */
async function addMistakesToReview({
  admin,
  userId,
  skill,
  week,
  plan,
  results,
}: {
  admin: SupabaseClient;
  userId: string;
  skill: FinishSkill;
  week: number;
  plan: NonNullable<ReturnType<typeof practicePlan>>;
  results: Record<string, boolean>;
}): Promise<number> {
  const mistakes = plan.items.filter((item) => item.counted && results[item.id] === false);

  if (skill === 'vocabulary') {
    let added = 0;
    for (const item of mistakes) {
      if (!item.term) continue;
      const { updated } = await updateReviewFromWeeklyPractice(admin, userId, item.term, false);
      if (updated) added += 1;
    }
    return added;
  }

  const cards = mistakes
    .filter((item) => typeof item.key === 'string' && item.key.trim())
    .map((item) => ({
      user_id: userId,
      category: 'tense' as const,
      prompt_sentence: item.prompt,
      corrected_sentence: item.key as string,
      // Shown on the Review card under the sentence, so it says what to do
      // rather than naming a "target": the card is the repair itself.
      explanation: `Write the sentence again with this correction: ${correctedFor(item.key as string)}.`,
      context_sentence: null,
      card_format: 'fix_sentence',
      normalized_key: normalizeKey(item.prompt),
      due_at: new Date().toISOString(),
    }))
    .filter((card) => Boolean(card.normalized_key));
  if (!cards.length) return 0;

  // One at a time, so a duplicate in the batch does not reject the rest: the
  // unique index on (user_id, category, normalized_key) is what deduplicates,
  // and an existing card simply counts as already in Review.
  let added = 0;
  for (const card of cards) {
    const { error } = await admin.from('error_review_cards').insert(card);
    if (!error) added += 1;
    else if (error.code !== '23505') {
      // A Review card is a follow-on; the completion record still stands.
      console.error('[week-finish] Could not add a grammar mistake to Review:', error.message);
    }
  }
  void week;
  return added;
}

/** The same normalisation the writing feedback uses, so a repeat is a duplicate. */
function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function correctedFor(value: string) {
  return value.trim().replace(/[.!?]+$/, '');
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

  const { data: current, error: progressError } = await client.rpc('refresh_current_week');
  if (progressError) return { ok: false, status: 503, error: 'Could not check your progress.' };
  if (week > Number(current)) return { ok: false, status: 403, error: 'This week is not open yet.' };

  const { data, error } = await admin
    .from(TABLES[skill])
    .select('item_id, answer, correct')
    .eq('user_id', userId)
    .eq('week_number', week)
    .order('created_at', { ascending: true });
  if (error) return { ok: false, status: 503, error: 'Could not read your answers.' };

  const known = new Set(plan.items.map((item) => item.id));
  const results: Record<string, boolean> = {};
  for (const row of (data ?? []) as Row[]) {
    if (!known.has(row.item_id)) continue;
    results[row.item_id] = row.correct;
  }

  const remaining = unmarkedRequired(plan.items, results).length;
  if (!canFinish(plan.items, results)) {
    return {
      ok: false,
      status: 400,
      error: 'Answer the questions first, then finish.',
      remaining,
    };
  }

  const counts = practiceCounts(plan.items, results);
  const reviewMistakes = await addMistakesToReview({ admin, userId, skill, week, plan, results });
  const sentence = summarySentence({ ...counts, reviewMistakes });

  const { error: saveError } = await admin.from('week_skill_completions').upsert(
    {
      user_id: userId,
      week_number: week,
      skill,
      answered: counts.answered,
      correct: counts.correct,
      total: counts.total,
      review_count: reviewMistakes,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,week_number,skill' },
  );
  if (saveError) {
    console.error('[week-finish] Could not save the completion:', saveError.message);
    return { ok: false, status: 503, error: 'Could not save your progress. Please try again.' };
  }

  return { ok: true, summary: { ...counts, reviewMistakes, sentence } };
}
