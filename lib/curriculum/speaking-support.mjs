/** Pure projection/helpers for the week 1–4 speaking support pilot. */
export function publicSpeakingSupport(week, random = Math.random) {
  const content = week && typeof week === 'object' ? week : null;
  if (!content) return null;
  const { focusQuestion, noticePhrases, distractors, planNotes, retryGoal } = content;
  const choices = [...noticePhrases, ...distractors];
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [choices[index], choices[other]] = [choices[other], choices[index]];
  }
  return {
    planNotes: [...planNotes],
    focusQuestion: { question: focusQuestion.question, options: [...focusQuestion.options] },
    noticePhrases: choices,
    retryGoal,
  };
}

/** Find the exact listed phrase, ignoring only capitalization. */
export function phrasesUsed(text, phrases) {
  const source = typeof text === 'string' ? text.toLocaleLowerCase('en-GB') : '';
  return phrases.filter((phrase) => source.includes(phrase.toLocaleLowerCase('en-GB')));
}

/** Match only supplied phrase strings, longest-first, without losing other text. */
export function splitHighlightedText(text, phrases) {
  if (!text) return [];
  const ordered = [...phrases].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!ordered.length) return [{ text, highlighted: false }];
  const escaped = ordered.map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const expression = new RegExp(`(${escaped.join('|')})`, 'gi');
  return text.split(expression).filter(Boolean).map((part) => ({
    text: part,
    highlighted: ordered.some((phrase) => phrase.toLocaleLowerCase('en-GB') === part.toLocaleLowerCase('en-GB')),
  }));
}

export function validSupportNotes(input, labels) {
  if (!Array.isArray(input) || input.length !== labels.length) return null;
  return labels.map((label, index) => {
    const item = input[index];
    if (!item || item.label !== label || typeof item.note !== 'string') return null;
    return { label, note: item.note.slice(0, 600) };
  }).every(Boolean) ? labels.map((label, index) => ({ label, note: input[index].note.slice(0, 600) })) : null;
}
