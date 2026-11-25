/**
 * Explicit learner-side alternatives for Week 1 questions where more than one
 * grammatical answer fits the wording. The teacher bank and its keys stay as
 * authored. No stemming, model calls, or general fuzzy matching is used.
 */
import { markFixedGrammarAnswer, matchesGrammarAnswer } from './grammar-marking.mjs';

export const LEARNER_GRAMMAR_ALTERNATIVES = Object.freeze({
  'W1-C3': ['left'],
  'W1-C5': ['Did ... live'],
  'W1-G1': ['drove'],
  'W1-F3': ['I knew her for years before we worked together.'],
  'W1-E2': ['never saw'],
});

export function markLearnerGrammarAnswer(item, answer) {
  // Validate the form and options with the normal server-side marker first.
  if (markFixedGrammarAnswer(item, answer)) return true;
  const alternatives = Object.hasOwn(LEARNER_GRAMMAR_ALTERNATIVES, item.id)
    ? LEARNER_GRAMMAR_ALTERNATIVES[item.id]
    : [];
  const text = Array.isArray(answer) ? answer.join(' ... ') : answer;
  return alternatives.some((candidate) => matchesGrammarAnswer(candidate, text, item.step === 'Fix'));
}
