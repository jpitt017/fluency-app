/**
 * The daily review queue: how many cards to show, in what order, and what to
 * say about them.
 *
 * Pure, so the numbers on screen can be tested without a database or a browser.
 */

/** The daily cap. After this many cards, the rest wait for tomorrow. */
export const DAILY_CAP = 20;

/** Rough cost of one card, used for the "about N minutes" line. */
export const SECONDS_PER_CARD = 20;

/**
 * Order the queue: most overdue first, then the ones missed most often.
 *
 * "Overdue" is due_at ascending, which the database already filters on, but the
 * order is applied here as well so the two card types can be merged without the
 * database having to know about both.
 */
export function orderQueue(cards) {
  return [...cards].sort((a, b) => {
    const dueA = new Date(a.due_at ?? 0).getTime();
    const dueB = new Date(b.due_at ?? 0).getTime();
    if (dueA !== dueB) return dueA - dueB;
    // Most missed first: lapses is the FSRS count of times this card was
    // forgotten outright; occurrence_count is how often the mistake has shown up
    // in the learner's own work. Either makes a card a better use of a slot.
    const missedA = Number(a.lapses ?? 0) + Number(a.occurrence_count ?? 0);
    const missedB = Number(b.lapses ?? 0) + Number(b.occurrence_count ?? 0);
    if (missedA !== missedB) return missedB - missedA;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** "about 4 minutes" for 12 cards; never "1 minutes". */
export function minutesLabel(count) {
  const minutes = Math.max(1, Math.round((count * SECONDS_PER_CARD) / 60));
  return minutes === 1 ? 'about 1 minute' : `about ${minutes} minutes`;
}

/** The line at the top of the page. */
export function summaryLabel(count) {
  if (count === 0) return "Today's review: nothing due";
  const cards = count === 1 ? '1 card' : `${count} cards`;
  return `Today's review: ${cards}, ${minutesLabel(count)}`;
}

/**
 * Decide what to show.
 *
 * `reviewedToday` comes from the server, so reloading the page does not reset
 * the cap. `wantMore` is the "Review more" button: it lifts the cap for the rest
 * of the session without changing the stored count.
 */
export function planQueue(cards, { reviewedToday = 0, wantMore = false } = {}) {
  const ordered = orderQueue(cards);
  const used = Math.max(0, Math.min(DAILY_CAP, Number(reviewedToday) || 0));
  const room = Math.max(0, DAILY_CAP - used);

  // Nothing due at all: the learner is finished for the day and there is nothing
  // to offer, so "Review more" is not shown.
  if (ordered.length === 0) {
    return {
      cards: [],
      shown: 0,
      remaining: 0,
      reviewedToday: used,
      cap: DAILY_CAP,
      capReached: used >= DAILY_CAP,
      done: true,
      canReviewMore: false,
      summary: summaryLabel(0),
      minutes: 0,
    };
  }

  const visible = wantMore ? ordered : ordered.slice(0, room);
  const remaining = ordered.length - visible.length;

  return {
    cards: visible,
    shown: visible.length,
    remaining,
    reviewedToday: used,
    cap: DAILY_CAP,
    // "Reached" is about today's allowance, not about the queue being empty.
    capReached: used >= DAILY_CAP && !wantMore && remaining > 0,
    done: visible.length === 0,
    // Only worth offering when the cap is what stopped us, and there is
    // something left to do.
    canReviewMore: used >= DAILY_CAP && remaining > 0 && !wantMore,
    summary: summaryLabel(wantMore ? ordered.length : Math.min(ordered.length, room)),
    minutes: Math.round(((wantMore ? ordered.length : Math.min(ordered.length, room)) * SECONDS_PER_CARD) / 60),
  };
}

/**
 * The grade a typed answer earns.
 *
 * Right is Good, wrong is Again. There is no Hard, and Easy is not automatic:
 * the learner opts into it after a correct answer (see `canUpgradeToEasy`).
 */
export function gradeForTypedAnswer(correct) {
  return correct ? 'good' : 'again';
}

/**
 * Whether the Easy button may be offered.
 *
 * Only after a correct typed answer: a wrong answer is Again, and cannot be
 * upgraded. `selfRated` cards (no typed answer) keep all four buttons, so they
 * are not subject to this.
 */
export function canUpgradeToEasy({ correct, selfRated = false }) {
  return selfRated || correct === true;
}
