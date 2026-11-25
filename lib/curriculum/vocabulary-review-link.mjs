/**
 * Which vocabulary card a weekly exercise answer is practising.
 *
 * Used by the vocabulary marking route to feed Review: an answer to a word in
 * the weekly steps updates that word's FSRS card, so a mistake comes back
 * sooner. Pure, so the mapping can be tested without a database.
 */

/** Lower-case, collapse whitespace, and drop a trailing full stop. */
export function normaliseTerm(value) {
  // Trim first: a trailing full stop followed by a space is not at the end of
  // the string, so stripping punctuation before the trim misses it.
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en-GB')
    .replace(/\s+/g, ' ')
    // Straight and curly quotes, which Spanish-authored content uses.
    .replace(/^["'‘’“”(]+|["'‘’“”)]+$/g, '')
    .replace(/[.,!?;:]+$/g, '')
    .trim();
}

/** The item, from whichever exercise list holds this id. */
export function findExerciseItem(week, id) {
  const match = week?.match?.items?.find((entry) => entry.id === id);
  if (match) return { kind: 'match', item: match };
  const text = week?.text?.items?.find((entry) => entry.id === id);
  if (text) return { kind: 'text', item: text };
  const choice = [...(week?.chooseVerb ?? []), ...(week?.wordForms ?? [])].find((entry) => entry.id === id);
  if (choice) return { kind: 'choice', item: choice };
  const typed = week?.typeTheWord?.items?.find((entry) => entry.id === id);
  if (typed) return { kind: 'typed', item: typed };
  return null;
}

/**
 * The four gap-fill answers written in an inflected or expanded collocation
 * form, mapped to the authored card they practise.
 *
 * Explicit pairs, never a guess: stemming "made" to "make" or stripping
 * "(someone)" would sooner or later map an answer onto a word nobody reviewed. Each
 * left side is exactly a `text.items[].key` in the exercise bank; each right
 * side is exactly a card target in weeks-01-04-details.json and a term in the
 * weeks-01-04 deck (migration 0048), so the Review update finds the card the
 * learner already has. The unit tests pin both ends of every pair.
 */
export const COLLOCATION_CARD_ALIASES = Object.freeze({
  'made a big decision': 'make a big decision',
  'improve my skills': 'improve your skills',
  'looking forward': 'look forward to',
  'invite friends round': 'invite (someone) round',
});

/** The card term for an answer surface form; unchanged when no alias applies. */
function cardTermFor(surface) {
  if (typeof surface !== 'string') return surface ?? null;
  // Match only the exact authored answer. No stemming, inference, or inherited
  // object properties can silently turn another word into a different card.
  return Object.hasOwn(COLLOCATION_CARD_ALIASES, surface) ? COLLOCATION_CARD_ALIASES[surface] : surface;
}

/**
 * The vocabulary term this exercise answer is about, or null when the exercise
 * is not about a single vocabulary word.
 *
 * The collocation and word-form items ("make progress" vs "do progress") are
 * about a verb that is not in the week's vocabulary list, so there is no card to
 * update and inventing one would put an unreviewed word in a learner's queue.
 */
export function termForExercise(week, id) {
  const found = findExerciseItem(week, id);
  if (!found) return null;
  switch (found.kind) {
    case 'match':
      // The word being matched to its meaning.
      return found.item.word ?? null;
    case 'text':
      // The word that fills the gap, as its card names it.
      return cardTermFor(found.item.key);
    case 'typed':
      // The word being typed from its meaning.
      return cardTermFor(found.item.key);
    default:
      return null;
  }
}
