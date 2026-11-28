import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import vocabularyBank from '../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json';
import vocabularyMeanings from './vocabulary-meanings.json';
import inputReasons from './input-reasons.json';
import vocabPractice from '../../supabase-b1-b2/content/curriculum/vocab-review-practice-weeks-01-04.json';
import { createReviewEnricher } from './review-card-enrichment.mjs';
import type { ErrorReviewMeta, VocabReviewMeta } from '@/lib/b1b2/types';

const enricher = createReviewEnricher({
  details,
  vocabularyBank,
  vocabularyMeanings,
  inputReasons,
  vocabPractice,
});

export function enrichErrorReviewCard(card: {
  prompt_sentence?: string | null;
  corrected_sentence?: string | null;
  context_sentence?: string | null;
  normalized_key?: string | null;
  explanation?: string | null;
}): ErrorReviewMeta {
  return enricher.enrichErrorReviewCard(card) as ErrorReviewMeta;
}

export function enrichVocabReviewCard(card: {
  term?: string | null;
  definition?: string | null;
  translation_es?: string | null;
}): VocabReviewMeta {
  return enricher.enrichVocabReviewCard(card) as VocabReviewMeta;
}

export const {
  checkReviewCardAnswer,
  checkReviewPracticeItem,
} = enricher;
