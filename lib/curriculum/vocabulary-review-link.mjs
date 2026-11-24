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
      // The word that fills the gap.
      return found.item.key ?? null;
    case 'typed':
      // The word being typed from its meaning.
      return found.item.key ?? null;
    default:
      return null;
  }
}
