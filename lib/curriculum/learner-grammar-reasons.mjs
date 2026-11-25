/**
 * A few teacher-authored explanations use grammar terms that are harder for B1
 * learners. Keep the teacher bank unchanged and use these explicit learner
 * versions after checking an answer (and when restoring that answer).
 */
export const LEARNER_GRAMMAR_REASONS = Object.freeze({
  'W1-C3': 'Both answers can work. Had left means the train left before you arrived.',
  'W1-C5': 'Both questions can work. Have you ever lived asks about life up to now.',
  'W1-G1': 'Both answers work. Were driving shows what was happening when it rained.',
  'W1-F3': 'Both knew and had known can describe the earlier time.',
  'W1-E2': 'Both answers work. Had never seen shows the earlier time.',
  'W2-R2': 'Use will in the main part of the sentence, and the present simple after as soon as.',
  'W3-L1': 'In questions, do comes before the person: What time do you get home?',
  'W4-L1': 'Use where for a place when a full sentence follows: the restaurant where we had our first date.',
});

/** Return the learner's explanation without changing the teacher's copy. */
export function learnerGrammarReason(item) {
  if (!item) return null;
  return Object.hasOwn(LEARNER_GRAMMAR_REASONS, item.id) ? LEARNER_GRAMMAR_REASONS[item.id] : item.reason ?? null;
}
