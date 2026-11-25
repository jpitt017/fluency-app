/**
 * A few teacher-authored explanations use grammar terms that are harder for B1
 * learners. Keep the teacher bank unchanged and use these explicit learner
 * versions after checking an answer (and when restoring that answer).
 */
export const LEARNER_GRAMMAR_REASONS = Object.freeze({
  'W2-R2': 'Use will in the main part of the sentence, and the present simple after as soon as.',
  'W3-L1': 'In questions, do comes before the person: What time do you get home?',
  'W4-L1': 'Use where for a place when a full sentence follows: the restaurant where we had our first date.',
});

/** Return the learner's explanation without changing the teacher's copy. */
export function learnerGrammarReason(item) {
  if (!item) return null;
  return Object.hasOwn(LEARNER_GRAMMAR_REASONS, item.id) ? LEARNER_GRAMMAR_REASONS[item.id] : item.reason ?? null;
}
