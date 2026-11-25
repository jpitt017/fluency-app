/**
 * Finishing the grammar and vocabulary practice on /week/[n].
 *
 * The rules live here, in one place, because three things have to agree about
 * them: the button the learner sees, the completion record the server saves, and
 * the summary shown after a reload. Two copies of these rules in the two
 * components drifted apart within one edit before.
 *
 * Which items count
 * -----------------
 * `optional` items never block finishing:
 *
 *   - grammar Rewrite and "Use it" items, which are judged by the app rather
 *     than against one key, and a quota error must not leave a learner unable to
 *     finish a section;
 *   - vocabulary step 7 "Your sentences", which is the same kind of work.
 *
 * `counted` items are the fixed-answer questions in the score. Week 1 grammar
 * has 22 (3 meaning + 6 choose + 5 complete + 3 fix + 3 light + 2 review).
 * Only checked, saved answers to those questions contribute to answered/right/
 * wrong; an unanswered or optional item is never a mistake.
 *
 * The hidden Extra items are counted as neither: whether they appear at all
 * depends on the learner's score (see grammar-branch.mjs), so letting them into
 * the denominator would make the total move under the learner's feet.
 */

/** Grammar flags for one item. `needsAi` is what the projection marks. */
export function grammarItemFlags(item) {
  if (item.needsAi) return { optional: true, counted: false };
  // The Extra items only appear below 60%, so they are practice, not a target.
  if (item.target === 'Extra') return { optional: true, counted: false };
  return { optional: false, counted: true };
}

/**
 * Vocabulary flags for one step. Step 0 is the word cards (no questions) and
 * step 6 is "Your sentences", the free-text step.
 */
export function vocabularyItemFlags(stepIndex) {
  if (stepIndex === 6) return { optional: true, counted: false };
  return { optional: false, counted: stepIndex > 0 };
}

/**
 * The first step with something still unanswered, or 0 when every step is done.
 *
 * Optional items count as "unfinished" too: a learner who has answered every
 * question but left the writing step alone lands there, which is the useful
 * place to start, not step 1.
 */
export function firstUnfinishedStep(steps, results) {
  const index = steps.findIndex((step) =>
    step.items.some((item) => typeof results[item.id] !== 'boolean'),
  );
  return index === -1 ? 0 : index;
}

/**
 * The step a reload should open on.
 *
 * Not simply "the first step with a gap": vocabulary step 1 is the word cards,
 * which ask nothing, so a learner who has answered nothing at all would be
 * dropped into step 2 and never see the words. Two rules instead:
 *
 *   - nothing answered anywhere yet -> the first step, which is what a learner
 *     opening the section for the first time expects;
 *   - otherwise the first step with a required question still unanswered, and
 *     when none is left the last step, where Finish lives.
 *
 * Steps here are the server's plan steps, so each item carries `optional`.
 */
export function resumeStep(steps, results) {
  if (!Object.keys(results).length) return 0;
  const gap = steps.findIndex((step) =>
    step.items.some((item) => !item.optional && typeof results[item.id] !== 'boolean'),
  );
  if (gap !== -1) return gap;
  return Math.max(0, steps.length - 1);
}

/** The questions still to answer before the section can be finished. */
export function unmarkedRequired(items, results) {
  return items.filter((item) => !item.optional && typeof results[item.id] !== 'boolean');
}

// A partial practice can be finished, but an unchecked section has no score.
export function canFinish(items, results) {
  return items.some((item) => item.counted && typeof results[item.id] === 'boolean');
}

/**
 * `total` is the number of fixed questions available. Everything else counts
 * only their saved marks, so right + wrong = answered even with skipped or
 * optional items and repeated attempts.
 */
export function practiceCounts(items, results) {
  const counted = items.filter((item) => item.counted);
  const answered = counted.filter((item) => typeof results[item.id] === 'boolean').length;
  const correct = counted.filter((item) => results[item.id] === true).length;
  return { total: counted.length, answered, correct, wrong: answered - correct };
}

/**
 * Older completions included optional answers in `answered`. Previously every
 * counted question had to be checked before finishing, so capping that old
 * value at `total` restores the original fixed-question count. New partial
 * completions already have answered <= total. Keep the saved snapshot rather
 * than silently recomputing a different score after another attempt.
 */
export function completionCounts(completion, fallbackTotal = 0) {
  const nonNegative = (value) => Number.isInteger(value) && value > 0 ? value : 0;
  const total = nonNegative(completion.total) || nonNegative(fallbackTotal);
  const correct = Math.min(total, nonNegative(completion.correct));
  const answered = Math.min(total, Math.max(correct, nonNegative(completion.answered)));
  return { total, answered, correct, wrong: answered - correct };
}

/** The same B1 summary is used for a new finish and the saved snapshot. */
export function summarySentence({ answered, correct, total, skill = 'grammar', reviewReady = true }) {
  const score = `You answered ${answered} of ${total}. ${correct} ${correct === 1 ? 'was' : 'were'} right.`;
  let message;
  if (!answered) {
    message = 'Answer and check a question to see your score.';
  } else if (correct * 100 >= answered * 80) {
    message = 'Great work!';
  } else if (correct * 100 >= answered * 50) {
    message = reviewReady
      ? 'Good effort! Your mistakes are in Review, so you can practise them.'
      : 'Good effort! Press Finish again to add your mistakes to Review.';
  } else {
    message = skill === 'vocabulary'
      ? "This vocabulary is new. Look at 'Words' again, then try your Review cards."
      : "This grammar is new. Look at 'See it' again, then try your Review cards.";
  }
  const unfinished = answered < total ? ' You can come back and finish the other questions.' : '';
  return `${score} ${message}${unfinished}`;
}

/** Where the section's finishing button sends the learner next. */
export function nextTaskAfter(skill, { hasVocabulary } = {}) {
  if (skill === 'grammar' && hasVocabulary) {
    return { label: 'Next: Vocabulary →', href: '#vocabulary-practice' };
  }
  return { label: 'Next: Reading →', href: '#reading-practice' };
}

/** A first saved fixed answer is needed before there is a score to finish. */
export function finishHint(items, results) {
  return canFinish(items, results) ? null : 'Answer and check at least 1 question to finish.';
}
