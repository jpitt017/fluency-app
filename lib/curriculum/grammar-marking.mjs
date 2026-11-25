/** Deterministic marking for the fixed-answer grammar items.
 * This module must only be called on the server with the private item bank.
 */
export function normaliseGrammarAnswer(value) {
  return value.normalize('NFKC').replace(/[’‘]/g, "'").trim().toLocaleLowerCase('en-GB')
    .replace(/\s+/g, ' ').replace(/[.!?]+$/g, '').trim();
}

/**
 * Compare an authored grammar answer to a learner's answer. In a full-sentence
 * Fix or Rewrite only, an authored comma after a single introductory when,
 * while or as-soon-as clause may be left out. Other commas remain significant:
 * this is not a general punctuation-stripping or fuzzy-matching rule.
 */
export function matchesGrammarAnswer(expected, answer, allowIntroductoryComma = false) {
  const expectedNorm = normaliseGrammarAnswer(expected);
  const answerNorm = normaliseGrammarAnswer(answer);
  if (expectedNorm === answerNorm) return true;
  if (!allowIntroductoryComma || !/^(?:when|while|as soon as)\b/.test(expectedNorm)
      || (expectedNorm.match(/,/g) ?? []).length !== 1) return false;
  return expectedNorm.replace(/,\s*/g, ' ') === answerNorm;
}

/** Answer is a string, or one string per blank for multi-part answers. */
export function markFixedGrammarAnswer(item, answer) {
  if (item.step === 'Use it') throw new Error('Personal answers require AI feedback');
  if (Array.isArray(item.key)) {
    let parts = answer;
    // Multiple-choice options encode the two blanks with an ellipsis.
    if (typeof answer === 'string' && item.options.includes(answer)) parts = answer.split(/\s*\.{3}\s*/);
    if (!Array.isArray(parts) || parts.length !== item.key.length || parts.some(x => typeof x !== 'string' || !x.trim())) {
      throw new Error('Please answer each blank.');
    }
    return item.key.every((key, index) => {
      const accepted = Array.isArray(item.accepted[index]) ? item.accepted[index] : [];
      return [key, ...accepted].some(value => matchesGrammarAnswer(value, parts[index]));
    });
  }
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('Please write an answer.');
  if (item.options.length && !item.options.includes(answer)) throw new Error('Please choose one of the answers.');
  const accepted = item.accepted.filter(value => typeof value === 'string');
  return [item.key, ...accepted].some(value =>
    matchesGrammarAnswer(value, answer, item.step === 'Fix' || item.step === 'Rewrite'),
  );
}

/** Adaptive branches use only Choose and Complete, never meaning or extra items. */
export function grammarBranch(items, results) {
  const core = items.filter(item => item.step === 'Choose' || item.step === 'Complete');
  if (!core.length || core.some(item => typeof results[item.id] !== 'boolean')) return null;
  const correct = core.filter(item => results[item.id]).length;
  return { correct, total: core.length, extra: correct / core.length < 0.6, skipRewrite: correct / core.length >= 0.9 };
}

/** Build a fresh answer-free object rather than removing fields from the teacher payload. */
export function projectLearnerGrammar(practice) {
  return {
    notice: practice.notice.text,
    items: practice.items.map(item => ({
      id: item.id,
      step: item.step,
      prompt: item.prompt,
      options: [...item.options],
      blankCount: Array.isArray(item.key) && !item.options.length ? item.key.length : 1,
    })),
  };
}
