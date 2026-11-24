/**
 * Marking for the three free-text boxes on /week/[n]: the grammar rewrite items
 * in "Fix it", the grammar "Use it" sentences, and vocabulary step 7
 * "Your sentences".
 *
 * Two things separate this from the fixed-answer marking:
 *
 * 1. what counts as correct is not one string. A rewrite item carries a key and a
 *    list of accepted alternatives ("I've been..." and "I have been..." are the
 *    same answer); a "Use it" sentence has no key at all and only a model can
 *    judge it. So the caller passes the accepted answers it has, empty when there
 *    are none, and an answer that matches one costs no AI units. This was
 *    originally done by inferring a target form from the authoring prose
 *    ("narrative tenses; present perfect vs past simple"), which rejected every
 *    one of the 20 authored grammar keys -- prose describes the grammar, it is
 *    not a form a sentence has to contain;
 * 2. the learner gets feedback in three parts -- what is good, the corrected
 *    sentence, and one tip -- rather than correct/incorrect.
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
 * form is stored against that answer as a repair card. A "Use it" sentence has
 * no answer to repair: the learner's own sentence is the prompt, and the
 * corrected form is what they should have written, which is exactly the cloze
 * card the review queue wants.
 */
export function reviewCardFor({ kind, prompt, answer, corrected, target, category }) {
  const learnerAnswer = String(answer ?? '').trim();
  if (!learnerAnswer) return null;
  return {
    category: category && String(category).length ? category : 'tense',
    prompt_sentence: String(prompt ?? '').trim() || learnerAnswer,
    corrected_sentence: String(corrected ?? '').trim() || learnerAnswer,
    explanation: `Use the target form here: ${String(target ?? 'the grammar from this week').trim()}.`,
    context_sentence: kind === 'rewrite' ? null : learnerAnswer,
    card_format: kind === 'rewrite' ? 'fix_sentence' : 'cloze',
  };
}
