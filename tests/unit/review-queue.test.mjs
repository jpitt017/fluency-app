import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_CAP,
  SECONDS_PER_CARD,
  canUpgradeToEasy,
  gradeForTypedAnswer,
  minutesLabel,
  orderQueue,
  planQueue,
  summaryLabel,
} from '../../lib/b1b2/review-queue.mjs';

const card = (id, due, extra = {}) => ({ id, due_at: due, lapses: 0, occurrence_count: 0, ...extra });

test('a typed answer sets the rating: right is Good, wrong is Again', () => {
  assert.equal(gradeForTypedAnswer(true), 'good');
  assert.equal(gradeForTypedAnswer(false), 'again');
});

test('Hard is never the result of marking', () => {
  for (const correct of [true, false]) {
    assert.notEqual(gradeForTypedAnswer(correct), 'hard');
  }
});

test('Easy is offered after a correct answer, and never after a wrong one', () => {
  assert.equal(canUpgradeToEasy({ correct: true }), true);
  assert.equal(canUpgradeToEasy({ correct: false }), false);
});

test('a card with no typed answer keeps all four self-ratings', () => {
  // Self-rated is not subject to the marking rule at all.
  assert.equal(canUpgradeToEasy({ correct: undefined, selfRated: true }), true);
});

test('the daily cap is 20', () => {
  assert.equal(DAILY_CAP, 20);
});

test('the cap shows 20 cards, most overdue first', () => {
  const cards = Array.from({ length: 35 }, (_, i) =>
    // Later index = later due date, so index order is overdue order reversed.
    card(`c${String(i).padStart(2, '0')}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()),
  );
  const plan = planQueue(cards, { reviewedToday: 0 });
  assert.equal(plan.shown, 20);
  assert.equal(plan.cards.length, 20);
  assert.equal(plan.remaining, 15);
  assert.deepEqual(
    plan.cards.map((entry) => entry.id).slice(0, 3),
    ['c00', 'c01', 'c02'],
    'the most overdue come first',
  );
});

test('after the cap is reached the rest wait for tomorrow', () => {
  const cards = Array.from({ length: 35 }, (_, i) =>
    card(`c${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()),
  );
  // 20 already done today: nothing more is shown, and the card says so.
  const plan = planQueue(cards, { reviewedToday: 20 });
  assert.equal(plan.shown, 0);
  assert.equal(plan.done, true);
  assert.equal(plan.capReached, true);
  assert.equal(plan.canReviewMore, true, 'there is more to offer');
  assert.equal(plan.remaining, 35);
});

test('a part-used allowance only shows what is left of it', () => {
  const cards = Array.from({ length: 35 }, (_, i) =>
    card(`c${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()),
  );
  const plan = planQueue(cards, { reviewedToday: 12 });
  assert.equal(plan.shown, 8, '20 − 12');
  assert.equal(plan.canReviewMore, false, 'the cap is not reached yet');
});

test('"Review more" lifts the cap and offers everything still due', () => {
  const cards = Array.from({ length: 35 }, (_, i) =>
    card(`c${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()),
  );
  const more = planQueue(cards, { reviewedToday: 20, wantMore: true });
  assert.equal(more.shown, 35);
  assert.equal(more.canReviewMore, false, 'the button is not offered twice');
  assert.equal(more.capReached, false);
  assert.equal(more.remaining, 0);
});

test('"Review more" is not offered when nothing is left', () => {
  // Everything due today was already done: nothing remains to offer.
  const plan = planQueue([], { reviewedToday: 20, wantMore: false });
  assert.equal(plan.done, true);
  assert.equal(plan.canReviewMore, false);
});

test('a card still due after the cap is exactly what "Review more" exists for', () => {
  const cards = [card('only', '2026-01-01T00:00:00.000Z')];
  const plan = planQueue(cards, { reviewedToday: 20, wantMore: false });
  assert.equal(plan.done, true, 'nothing shown until the learner asks');
  assert.equal(plan.remaining, 1);
  assert.equal(plan.canReviewMore, true);
});

test('with nothing due, the session is finished and nothing is offered', () => {
  const plan = planQueue([]);
  assert.equal(plan.done, true);
  assert.equal(plan.shown, 0);
  assert.equal(plan.canReviewMore, false);
  assert.equal(plan.summary, "Today's review: nothing due");
});

test('cards due at the same moment are ordered by how often they were missed', () => {
  const due = '2026-01-01T00:00:00.000Z';
  const cards = [
    card('rarely', due, { lapses: 0, occurrence_count: 1 }),
    card('often', due, { lapses: 2, occurrence_count: 3 }),
    card('never', due, { lapses: 0, occurrence_count: 0 }),
  ];
  // "Most often missed" is lapses plus how often the mistake has recurred.
  assert.deepEqual(orderQueue(cards).map((entry) => entry.id), ['often', 'rarely', 'never']);
});

test('overdue beats frequently-missed: the order is due date first', () => {
  const cards = [
    card('missed-a-lot-but-recent', '2026-01-05T00:00:00.000Z', { lapses: 9 }),
    card('overdue', '2026-01-01T00:00:00.000Z', { lapses: 0 }),
  ];
  assert.equal(orderQueue(cards)[0].id, 'overdue');
});

test('the summary counts 20 seconds a card', () => {
  assert.equal(SECONDS_PER_CARD, 20);
  assert.equal(summaryLabel(12), "Today's review: 12 cards, about 4 minutes");
  assert.equal(summaryLabel(1), "Today's review: 1 card, about 1 minute");
  assert.equal(summaryLabel(0), "Today's review: nothing due");
  // 3 cards is one minute, not "0 minutes".
  assert.equal(minutesLabel(3), 'about 1 minute');
  assert.equal(minutesLabel(20), 'about 7 minutes');
});

test('the plan summary matches the number of cards it will show', () => {
  const cards = Array.from({ length: 25 }, (_, i) =>
    card(`c${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()),
  );
  const plan = planQueue(cards, { reviewedToday: 0 });
  assert.equal(plan.summary, "Today's review: 20 cards, about 7 minutes");
  assert.match(plan.summary, /^Today's review: 20 cards, about \d+ minutes$/);
});

test('a nonsense reviewed count degrades to zero rather than a negative room', () => {
  const cards = [card('a', '2026-01-01T00:00:00.000Z')];
  assert.equal(planQueue(cards, { reviewedToday: -5 }).shown, 1);
  assert.equal(planQueue(cards, { reviewedToday: Number.NaN }).shown, 1);
});

test('the cap never shows more than the cap in one sitting, whatever the count', () => {
  const cards = Array.from({ length: 50 }, (_, i) =>
    card(`c${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()),
  );
  for (const reviewedToday of [0, 1, 7, 19, 20, 40]) {
    const plan = planQueue(cards, { reviewedToday });
    assert.ok(plan.shown <= DAILY_CAP, `reviewedToday=${reviewedToday} showed ${plan.shown}`);
  }
});
