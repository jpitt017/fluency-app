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
 * `counted` items are the ones the "You got X of Y right" line is about: the
 * fixed-answer questions. That leaves week 1 grammar at 22 items (3 meaning +
 * 6 choose + 5 complete + 3 fix + 3 light + 2 review), which is what "You got
 * 18 of 22 right" in the brief describes.
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

export function canFinish(items, results) {
  return unmarkedRequired(items, results).length === 0;
}

/**
 * Totals for the summary. `total` is every counted question in the section, not
 * only the ones answered, so the number does not change as answers arrive.
 */
export function practiceCounts(items, results) {
  const counted = items.filter((item) => item.counted);
  return {
    total: counted.length,
    correct: counted.filter((item) => results[item.id] === true).length,
    answered: items.filter((item) => typeof results[item.id] === 'boolean').length,
  };
}

/** One B1 sentence: the whole summary the learner reads. */
export function summarySentence({ correct, total, reviewMistakes }) {
  const score =
    total > 0 ? `You got ${correct} of ${total} right.` : 'You finished this practice.';
  if (!reviewMistakes || reviewMistakes < 1) return `Well done! ${score}`;
  const mistakes =
    reviewMistakes === 1
      ? '1 mistake is now in your Review.'
      : `${reviewMistakes} mistakes are now in your Review.`;
  return `Well done! ${score} ${mistakes}`;
}

/** Where the section's finishing button sends the learner next. */
export function nextTaskAfter(skill, { hasVocabulary } = {}) {
  if (skill === 'grammar' && hasVocabulary) {
    return { label: 'Next: Vocabulary →', href: '#vocabulary-practice' };
  }
  return { label: 'Next: Reading →', href: '#reading-practice' };
}

/** "Answer 2 more questions to finish." — one line, no numbers the learner cannot act on. */
export function finishHint(remaining) {
  if (remaining < 1) return null;
  return remaining === 1
    ? 'Answer 1 more question to finish.'
    : `Answer ${remaining} more questions to finish.`;
}
