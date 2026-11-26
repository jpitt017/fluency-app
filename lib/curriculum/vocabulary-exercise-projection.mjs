/** Explicit projection: the private item bank must stay on the server. */
export function projectVocabularyExercises(week, sentenceSupport = []) {
  const supportById = new Map(sentenceSupport.map((entry) => [entry.id, entry]));
  return {
    week: week.week,
    title: week.title,
    careful: week.careful.map(({ target, note }) => ({ target, note })),
    match: {
      instruction: week.match.instruction,
      // Do not transmit word/meaning pairs or parallel arrays in matching order.
      words: week.match.items.map(({ id, word }) => ({ id, word })),
      meanings: week.match.items.map(({ meaning }) => meaning).sort(),
    },
    text: {
      instruction: week.text.instruction,
      body: week.text.body,
      wordBox: [...week.text.wordBox],
      items: week.text.items.map(({ id, gap }) => ({ id, gap })),
    },
    chooseVerb: week.chooseVerb.map(({ id, question, options }) => ({ id, question, options: [...options] })),
    wordForms: week.wordForms.map(({ id, question, options }) => ({ id, question, options: [...options] })),
    typeTheWord: {
      instruction: week.typeTheWord.instruction,
      items: week.typeTheWord.items.map(({ id, meaning, hint }) => ({ id, meaning, hint })),
    },
    yourSentence: week.yourSentence.map(({ id, prompt }) => {
      const support = supportById.get(id);
      // Examples are requested one at a time, not embedded in the initial page.
      return support ? { id, prompt: support.prompt, pattern: support.pattern, starter: support.starter } : { id, prompt };
    }),
  };
}
