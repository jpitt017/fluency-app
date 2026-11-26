import 'server-only';
import { createServerSupabase } from '@/utils/supabase/server';
import type { GrammarUseItFeedback } from '@/lib/b1b2/grammar-use-it-feedback';
import type { SentenceFeedback } from '@/lib/b1b2/week-sentence-feedback';

export type SentenceVersion = {
  answer: string;
  onTarget: boolean;
  feedback: GrammarUseItFeedback | SentenceFeedback;
};
export type SentencePractice = {
  first: SentenceVersion | null;
  second: SentenceVersion | null;
  /** A check that failed or was interrupted keeps the learner's draft. */
  draft: string | null;
};
export type SentencePracticeByItem = Record<string, SentencePractice>;

type Row = {
  item_id: string;
  kind: string;
  first_answer: unknown;
  first_feedback: unknown;
  first_on_target: unknown;
  second_answer: unknown;
  second_feedback: unknown;
  second_on_target: unknown;
  draft_answer: unknown;
};

function version(answer: unknown, feedback: unknown, onTarget: unknown): SentenceVersion | null {
  if (typeof answer !== 'string' || typeof onTarget !== 'boolean' || !feedback || typeof feedback !== 'object') return null;
  const value = feedback as Record<string, unknown>;
  if (typeof value.corrected !== 'string' || !value.corrected.trim()) return null;
  return { answer, onTarget, feedback: feedback as SentenceVersion['feedback'] };
}

/** Only the signed-in learner's own rows and the selected week are returned. */
export async function loadWeekSentencePractice(week: number): Promise<SentencePracticeByItem> {
  if (!Number.isInteger(week) || week < 1 || week > 4) return {};
  try {
    const client = await createServerSupabase();
    if (!client) return {};
    const { data: { user } } = await client.auth.getUser();
    if (!user) return {};
    const { data, error } = await client.from('week_sentence_practice')
      .select('item_id,kind,first_answer,first_feedback,first_on_target,second_answer,second_feedback,second_on_target,draft_answer')
      .eq('user_id', user.id).eq('week_number', week);
    if (error || !data) return {};
    const result: SentencePracticeByItem = {};
    for (const row of data as Row[]) {
      if ((row.kind !== 'grammar-use-it' && row.kind !== 'vocabulary-sentence') || typeof row.item_id !== 'string') continue;
      result[row.item_id] = {
        first: version(row.first_answer, row.first_feedback, row.first_on_target),
        second: version(row.second_answer, row.second_feedback, row.second_on_target),
        draft: typeof row.draft_answer === 'string' ? row.draft_answer : null,
      };
    }
    return result;
  } catch (error) {
    console.error('[week-sentence] Could not load saved practice:', error);
    return {};
  }
}

/** Show the newest corrected version for each Use it item, never another week. */
export function grammarWritingIdeas(practice: SentencePracticeByItem, week: number): string[] {
  return Object.entries(practice)
    .filter(([id]) => new RegExp(`^W${week}-U[12]$`).test(id))
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, saved]) => {
      // Prefer the rewrite, but keep the first correction if the rewrite did
      // not produce a usable correction. Never present an unchanged answer
      // that the checker rejected as though it had been corrected.
      for (const candidate of [saved.second, saved.first]) {
        if (!candidate) continue;
        const corrected = candidate.feedback.corrected.trim();
        if (corrected && (candidate.onTarget || corrected !== candidate.answer.trim())) return [corrected];
      }
      return [];
    });
}
