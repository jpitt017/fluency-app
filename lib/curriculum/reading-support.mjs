/** Pure projection and marking helpers for the Week 1–4 reading support pilot. */

export const PRIVATE_FIELDS = Object.freeze([
  'answerIndex', 'answer_index', 'key', 'accepted', 'model', 'modelAnswer', 'feedback',
]);

export function containsPrivateField(value) {
  if (Array.isArray(value)) return value.some(containsPrivateField);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([field, child]) => PRIVATE_FIELDS.includes(field) || containsPrivateField(child));
}

export function readingSupportFor(content, week) {
  return content?.weeks?.find((entry) => entry.week === week) ?? null;
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function markText(text, glosses, cardWords) {
  const phrases = [...glosses, ...cardWords].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!phrases.length) return [{ text }];
  const pattern = new RegExp(`(${phrases.map(escapeRegExp).join('|')})`, 'gi');
  const glossLookup = new Map(glosses.map((word) => [word.toLowerCase(), word]));
  const cardLookup = new Map(cardWords.map((word) => [word.toLowerCase(), word]));
  return text.split(pattern).filter(Boolean).map((segment) => {
    const lower = segment.toLowerCase();
    if (glossLookup.has(lower)) return { text: segment, gloss: glossLookup.get(lower) };
    if (cardLookup.has(lower)) return { text: segment, card: cardLookup.get(lower) };
    return { text: segment };
  });
}

/**
 * Build only the fields suitable for this learner. Card definitions are omitted
 * entirely until `questionsAnswered` is true; this is called only by the server
 * loader after it checks saved answer rows.
 */
export function projectReadingSupport(content, week, {
  text = '',
  cardMeanings = {},
  questionsAnswered = false,
} = {}) {
  const source = readingSupportFor(content, week);
  if (!source) return null;
  const cards = (source.cardWords ?? []).map((entry) => {
    const word = entry.text;
    const meaning = cardMeanings[entry.card] ?? cardMeanings[entry.card.toLowerCase()] ?? null;
    return questionsAnswered && meaning ? { word, meaning } : { word };
  });
  // No `predict`: the old "Title: … First line: … ?" sentence stays in the
  // teacher's JSON and never reaches the learner's reading support projection.
  return {
    context: source.intro?.context ?? '',
    keyWords: (source.keyWords ?? []).map((entry) => ({
      word: entry.word, meaning: entry.meaning, es: entry.es, example: entry.example, note: entry.note ?? null,
    })),
    glosses: (source.glosses ?? []).map(({ tap, meaning, es }) => ({ tap, meaning, es })),
    cardWords: cards,
    text: markText(text, (source.glosses ?? []).map((entry) => entry.tap), (source.cardWords ?? []).map((entry) => entry.text)),
    glossCheck: (source.glossCheck ?? []).map((entry, index) => ({
      id: `gloss-${week}-${index + 1}`,
      stem: entry.stem,
      options: Array.isArray(entry.options) ? [...entry.options] : [],
    })),
  };
}

/** Mark one answer without exposing the authored index to the caller's client. */
export function markReadingGloss(content, week, itemId, answer) {
  const items = readingSupportFor(content, week)?.glossCheck ?? [];
  const index = items.findIndex((_, position) => `gloss-${week}-${position + 1}` === itemId);
  if (index < 0) throw new Error('This question is not available.');
  const item = items[index];
  if (typeof answer !== 'string' || !item.options.includes(answer)) throw new Error('Please choose one of the answers.');
  return {
    correct: item.options[item.answerIndex] === answer,
    answer: item.options[item.answerIndex],
    feedback: item.feedback,
  };
}
