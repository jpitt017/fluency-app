/**
 * Pure helpers for the Weeks 1–4 listening support content.
 *
 * Three jobs, all of them the same job seen from different sides: decide what a
 * learner may see, decide what the transcript is, and mark the gloss check
 * without ever handing the browser an answer.
 *
 * The content is a pilot draft (second-teacher review pending, especially the
 * Spanish), so nothing here hard-codes a per-week string: it is all read from
 * the JSON next to it.
 */

/**
 * Fields that must never be serialized to the browser.
 *
 * `answerIndex` is not a typo for `answer_index`: the pilot content uses camel
 * case, while `strip_answer_fields()` in the database strips snake case. Both
 * spellings are listed so neither route out.
 */
export const PRIVATE_FIELDS = Object.freeze([
  'answerIndex',
  'answer_index',
  'key',
  'accepted',
  'model',
  'modelAnswer',
  'feedback',
]);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when any object anywhere in `value` carries a private field. */
export function containsPrivateField(value) {
  if (Array.isArray(value)) return value.some(containsPrivateField);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([field, child]) => PRIVATE_FIELDS.includes(field) || containsPrivateField(child),
  );
}

/** The week's block, or null when the pilot content has no entry for it. */
export function supportFor(content, week) {
  return content?.weeks?.find((entry) => entry.week === week) ?? null;
}

function sortedByLength(words) {
  return [...words].filter(Boolean).sort((a, b) => b.length - a.length);
}

/**
 * Wrap every occurrence of the gloss phrases and the card words in markers.
 *
 * Longest first, and each match consumes its text, so "get used to" cannot be
 * swallowed by "used to" and a phrase is never marked twice. Case-insensitive,
 * because the pilot scripts capitalise some tokens ("Gradually").
 */
function markTranscript(script, phrases, cardWords) {
  const tagged = sortedByLength([...phrases, ...cardWords]);
  if (!tagged.length) return [{ text: script }];

  const pattern = new RegExp(`(${tagged.map(escapeRegExp).join('|')})`, 'gi');
  const glossLookup = new Map(phrases.map((phrase) => [phrase.toLowerCase(), phrase]));
  const cardLookup = new Map(cardWords.map((word) => [word.toLowerCase(), word]));

  return script
    .split(pattern)
    .filter((segment) => segment !== '')
    .map((segment) => {
      const lower = segment.toLowerCase();
      // A gloss wins over a card word: the 7 glosses are the ones this task asks
      // the learner to open, the card words only echo the vocabulary step.
      if (glossLookup.has(lower)) return { text: segment, gloss: glossLookup.get(lower) };
      if (cardLookup.has(lower)) return { text: segment, card: cardLookup.get(lower) };
      return { text: segment };
    });
}

/**
 * Everything a learner may receive for one week, and nothing else.
 *
 * Built field by field rather than by deleting from the source, so a new
 * authoring field cannot leak by default. `answerIndex` stops here: the gloss
 * check keeps only the stem and the options.
 *
 * The script is passed in rather than read here: it belongs to the listening
 * content that already exists for the week, and this file only knows how to
 * mark the phrases the support content names.
 */
export function projectSupport(content, week, { script = '', cardMeanings = {} } = {}) {
  const source = supportFor(content, week);
  if (!source) return null;

  const cardWords = Array.isArray(source.cardWords) ? source.cardWords : [];
  const meanings = Object.fromEntries(
    cardWords.map((word) => [
      word,
      // A card word the vocabulary step does not define still has to explain
      // itself on tap, so it degrades to a neutral B1 line rather than nothing.
      cardMeanings[word] ??
        cardMeanings[word.toLowerCase()] ??
        `A word from this week. Check the vocabulary cards for the full meaning.`,
    ]),
  );

  return {
    intro: {
      title: source.intro?.title ?? '',
      context: source.intro?.context ?? '',
      predict: source.intro?.predict ?? '',
      ideas: Array.isArray(source.intro?.ideas) ? [...source.intro.ideas] : [],
      // `picture` in the content is a brief for the illustrator, not a URL, so
      // it is not sent. Only a real `pictureUrl` is; the intro shows the
      // picture box only when there is one.
      pictureUrl: source.intro?.pictureUrl ?? null,
    },
    keyWords: (source.keyWords ?? []).map((word) => ({
      word: word.word,
      meaning: word.meaning,
      es: word.es,
      example: word.example,
      note: word.note ?? null,
    })),
    glosses: (source.glosses ?? []).map((gloss) => ({
      tap: gloss.tap,
      meaning: gloss.meaning,
      es: gloss.es,
    })),
    cardWords: cardWords.map((word) => ({ word, meaning: meanings[word] })),
    transcript: markTranscript(
      String(script ?? ''),
      (source.glosses ?? []).map((gloss) => gloss.tap),
      cardWords,
    ),
    glossCheck: (source.glossCheck ?? []).map((item, index) => ({
      // The stem is long and sentence-shaped; an index is a stable id that says
      // nothing about the answer.
      id: `gloss-${week}-${index + 1}`,
      stem: item.stem,
      options: Array.isArray(item.options) ? [...item.options] : [],
    })),
  };
}

/**
 * Mark one gloss-check answer.
 *
 * Returns the feedback and the right choice, so the caller can save the attempt
 * and the learner can see the right answer once they have answered. Throws on an
 * item or a choice that does not exist, so a bad request is a 400 rather than a
 * wrong mark.
 */
export function markGloss(content, week, itemId, answer) {
  const source = supportFor(content, week);
  const items = source?.glossCheck ?? [];
  const index = items.findIndex((_, position) => `gloss-${week}-${position + 1}` === itemId);
  if (index === -1) throw new Error('This question is not available.');
  const item = items[index];
  if (typeof answer !== 'string' || !item.options.includes(answer)) {
    throw new Error('Please choose one of the answers.');
  }
  return {
    correct: item.options[item.answerIndex] === answer,
    answer: item.options[item.answerIndex],
    feedback: item.feedback,
  };
}

