/**
 * Explicit learner-side alternatives and nearly-right guidance for Weeks 1–4
 * grammar questions. No stemming, model calls, or general fuzzy matching is used.
 */
import { answersEquivalent } from '../b1b2/contractions.mjs';
import { markFixedGrammarAnswer, matchesGrammarAnswer } from './grammar-marking.mjs';

export const LEARNER_GRAMMAR_ALTERNATIVES = Object.freeze({
  'W1-C3': ['left'],
  'W1-C5': ['Did ... live'],
  'W1-G1': ['drove'],
  'W1-F3': ['I knew her for years before we worked together.'],
  'W1-E2': ['never saw'],
});

export const NEARLY_RIGHT_GRAMMAR_ANSWERS = Object.freeze({
  'W3-V2': [
    {
      match: ['was closed', 'By the time we got there, the shop was closed.'],
      feedback: 'Good English! Here, try the past perfect: had closed.',
    },
  ],
});

export function nearlyRightGrammarFeedback(item, answer) {
  if (!item || !Object.hasOwn(NEARLY_RIGHT_GRAMMAR_ANSWERS, item.id)) return null;
  const text = Array.isArray(answer) ? answer.join(' ... ') : String(answer ?? '');
  if (!text.trim()) return null;
  for (const rule of NEARLY_RIGHT_GRAMMAR_ANSWERS[item.id]) {
    if (rule.match.some((candidate) => answersEquivalent(candidate, text))) {
      return rule.feedback;
    }
  }
  return null;
}

export function markLearnerGrammarAnswer(item, answer) {
  // Nearly-right answers (such as W3-V2 "was closed") are marked false with kind
  // guidance rather than rejected as invalid input.
  if (nearlyRightGrammarFeedback(item, answer)) return false;
  // Validate the form and options with the normal server-side marker first.
  if (markFixedGrammarAnswer(item, answer)) return true;
  const alternatives = Object.hasOwn(LEARNER_GRAMMAR_ALTERNATIVES, item.id)
    ? LEARNER_GRAMMAR_ALTERNATIVES[item.id]
    : [];
  const text = Array.isArray(answer) ? answer.join(' ... ') : answer;
  return alternatives.some((candidate) => matchesGrammarAnswer(candidate, text, item.step === 'Fix'));
}
