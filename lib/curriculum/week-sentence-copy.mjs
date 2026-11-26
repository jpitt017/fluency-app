/** Compare words, not punctuation, spacing, case or curly apostrophes. */
export function sentenceWords(value) {
  return (String(value ?? '')
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .toLocaleLowerCase('en-GB')
    .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []).join(' ');
}

export function copiesExample(answer, examples) {
  const words = sentenceWords(answer);
  if (!words) return false;

  // Match the whole example at word boundaries, even when it was pasted with
  // its heading or an extra sentence. Do not reject a learner just for using
  // a starter or a few words that also appear in the example.
  const paddedAnswer = ` ${words} `;
  return examples.some((example) => {
    const exampleWords = sentenceWords(example);
    return Boolean(exampleWords) && paddedAnswer.includes(` ${exampleWords} `);
  });
}

/** Count complete thoughts separated by sentence punctuation or line breaks. */
export function grammarSentenceCount(answer) {
  const text = String(answer ?? '').trim()
    // A full stop in a familiar title is not the end of the learner's sentence.
    .replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|St)\./gi, (title) => title.replace('.', '\uFFF0'));
  if (!text) return 0;
  return text.split(/(?<=[.!?])\s+|\n+/u).filter((part) => /[\p{L}\p{N}]/u.test(part)).length;
}

export function hasUnfilledStarter(answer) {
  return /_{2,}/u.test(String(answer ?? ''));
}
