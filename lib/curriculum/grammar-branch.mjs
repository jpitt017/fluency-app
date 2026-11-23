/**
 * The silent adaptive rules, kept in one place because two copies of this in
 * the component drifted apart within one edit.
 *
 * - After Practise, a learner scoring under 60% on the core choose/complete
 *   items sees the Extra items in Remember.
 * - A learner at 90% or better on those items does not get the rewrite items
 *   in Fix it.
 *
 * Neither rule changes the five visible steps and neither is announced: the
 * brief says apply them silently. Until the core items are all marked the
 * share is null and both branches stay closed, so nothing appears early.
 */

export const EXTRA_BELOW = 0.6;
export const SKIP_REWRITE_AT = 0.9;

/** Core items are the Main-target items in Practise (choose and complete). */
export function coreItems(steps) {
  return (steps[1]?.items ?? []).filter((item) => !item.target || item.target === 'Main');
}

/**
 * Share answered correctly across the core items, or null until every one of
 * them has been marked. A partially answered step is not a low score.
 */
export function coreShare(steps, results) {
  const core = coreItems(steps);
  if (!core.length) return null;
  if (!core.every((item) => typeof results[item.id] === 'boolean')) return null;
  return core.filter((item) => results[item.id]).length / core.length;
}

/** The items a step shows once the rules are applied. */
export function visibleItems(step, steps, results) {
  const share = coreShare(steps, results);
  return step.items.filter((item) => {
    if (step.title === 'Fix it' && item.step === 'Rewrite' && share !== null && share >= SKIP_REWRITE_AT) {
      return false;
    }
    if (step.title === 'Remember' && item.target === 'Extra' && !(share !== null && share < EXTRA_BELOW)) {
      return false;
    }
    return true;
  });
}
