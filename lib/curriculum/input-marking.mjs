/** Pure helpers for server-only marking of authored reading and listening items. */
const normalize = value => value.normalize('NFKC').replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');

/** The projected array contains no key, reason, accepted answer, or answer association. */
export function projectInputQuestions(questions) {
  return questions.map(q => ({ id: q.id, question: q.question, options: Array.isArray(q.options) ? [...q.options] : [] }));
}

/** A parenthetical after True/False is an explanation, not part of the choice. */
export function markInputAnswer(item, answer) {
  if (!item || typeof item.key !== 'string' || !Array.isArray(item.options)) throw new Error('Invalid answer key.');
  if (typeof answer !== 'string' || !answer.trim() || answer.length > 500) throw new Error('Please answer the question.');
  if (item.options.length && !item.options.includes(answer)) throw new Error('Please select an available answer.');
  const choice = item.options.find(option => option === item.key);
  const annotatedBoolean = /^(True|False)\s*\((.+)\)$/i.exec(item.key);
  const key = choice ?? (annotatedBoolean ? annotatedBoolean[1] : item.key);
  if (item.options.length && !item.options.includes(key)) throw new Error('Answer key does not match the choices.');
  const reason = typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : annotatedBoolean?.[2] ?? null;
  return { correct: normalize(answer) === normalize(key), reason };
}
