import { answersEquivalent } from '../b1b2/contractions.mjs';
import { evaluateAiCorrectionForCard } from '../b1b2/ai-review-card-filter.mjs';

/**
 * Marking for the three free-text boxes on /week/[n]: the grammar rewrite items
 * in "Fix it", the grammar "Use it" sentences, and vocabulary step 7
 * "Your sentences".
 */

/** Normalise for comparison only; the original is kept for the model and the DB. */
export function normaliseSentence(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .trim()
    .toLocaleLowerCase('en-GB');
}

/**
 * Split a learner answer into sentences. A full stop only ends a sentence when
 * it is followed by a space and a capital, so "2.5" and "e.g." survive.
 */
export function splitSentences(value) {
  return String(value ?? '')
    .split(/(?<=[.!?])\s+(?=[A-Z"'\u2018\u2019(])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The "what is good" line, built from the target rather than from the model, so
 * it is present even when the model is unavailable and cannot drift in tone.
 */
export function praiseFor(target, correct) {
  if (!correct) return null;
  const shown = String(target ?? '').trim();
  if (!shown) return 'You wrote a clear sentence.';
  return `You used the target form: ${shown}.`;
}

/** Shape the three parts the UI renders. Guarantees each one is non-empty. */
export function normaliseFeedback(value, fallback) {
  const pick = (candidate, alternative) => {
    const text = typeof candidate === 'string' ? candidate.trim() : '';
    return text || alternative;
  };
  return {
    good: pick(value && value.good, (fallback && fallback.good) || 'You had a go at the sentence.'),
    corrected: pick(value && value.corrected, (fallback && fallback.corrected) || ''),
    tip: pick(value && value.tip, (fallback && fallback.tip) || 'Read the sentence again before you send it.'),
  };
}

/**
 * Decide how a box answer is stored for the Review cards.
 *
 * A rewrite item has an authoring answer, so a sentence that misses the target
 * form is stored against that answer as a repair card. A "Use it" or personal
 * vocabulary sentence uses the AI card filter: only single-point fixes (changed
 * part <= 4 words, original <= 25 words, non-style category) create cards.
 */
export function reviewCardFor({ kind, prompt, answer, corrected, target, category = 'grammar', explanation = '' }) {
  const learnerAnswer = String(answer ?? '').trim();
  const repair = String(corrected ?? '').trim();
  if (!learnerAnswer || !repair || normaliseSentence(repair) === normaliseSentence(learnerAnswer) || answersEquivalent(learnerAnswer, repair)) {
    return null;
  }

  const cardCategory = category && String(category).length ? category : 'tense';
  const cardExplanation = typeof explanation === 'string' && explanation.trim()
    ? explanation.trim()
    : `Use the target form here: ${String(target ?? 'the grammar from this week').trim()}.`;

  if (kind === 'rewrite') {
    return {
      category: cardCategory,
      prompt_sentence: String(prompt ?? '').trim() || learnerAnswer,
      corrected_sentence: repair,
      explanation: cardExplanation,
      context_sentence: null,
      card_format: 'fix_sentence',
    };
  }

  const filtered = evaluateAiCorrectionForCard({
    original: learnerAnswer,
    corrected: repair,
    category: cardCategory,
    contextSentence: learnerAnswer,
  });
  if (!filtered.ok) return null;

  return {
    category: cardCategory,
    prompt_sentence: filtered.promptSentence === learnerAnswer
      ? (String(prompt ?? '').trim() || learnerAnswer)
      : filtered.promptSentence,
    corrected_sentence: filtered.correctedSentence,
    explanation: cardExplanation,
    context_sentence: filtered.contextSentence ?? learnerAnswer,
    card_format: 'cloze',
  };
}
