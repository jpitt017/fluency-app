import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normaliseTerm, termForExercise, findExerciseItem, COLLOCATION_CARD_ALIASES } from '../../lib/curriculum/vocabulary-review-link.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const bank = JSON.parse(read('supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json'));
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const week = (n) => bank.weeks.find((entry) => entry.week === n);

test('a match item links to the word being matched', () => {
  const item = week(1).match.items[0];
  assert.equal(termForExercise(week(1), item.id), item.word);
});

test('a gap-fill item links to the word that fills the gap, as its card names it', () => {
  // V1-T1's answer is the inflected "made a big decision"; the card is
  // "make a big decision", so the alias decides the term.
  assert.equal(termForExercise(week(1), 'V1-T1'), 'make a big decision');
  // A gap whose answer is already the card term passes through unchanged.
  const plain = week(1).text.items.find((item) => item.key === 'challenge');
  assert.equal(termForExercise(week(1), plain.id), 'challenge');
});

test('the alias list is exactly the four inflected collocation pairs, both ends authored', () => {
  // Explicit pairs, no guessing: every left side is a real gap-fill key in the
  // bank, every right side is a real card target in the weekly vocabulary.
  assert.deepEqual(COLLOCATION_CARD_ALIASES, {
    'made a big decision': 'make a big decision',
    'improve my skills': 'improve your skills',
    'looking forward': 'look forward to',
    'invite friends round': 'invite (someone) round',
  });
  const gapKeys = new Set(bank.weeks.flatMap((entry) => entry.text.items.map((item) => item.key)));
  const cardTargets = new Set(
    details.weeks.flatMap((entry) =>
      ['core', 'collocations', 'optional'].flatMap((group) => entry.vocabulary[group].map((word) => word.target)),
    ),
  );
  for (const [surface, card] of Object.entries(COLLOCATION_CARD_ALIASES)) {
    assert.ok(gapKeys.has(surface), `${surface} is not a gap-fill answer in the bank`);
    assert.ok(cardTargets.has(card), `${card} is not an authored vocabulary card`);
    assert.notEqual(surface, card);
  }
  // Each aliased answer now resolves to its card.
  assert.equal(termForExercise(week(1), 'V1-T1'), 'make a big decision');
  assert.equal(termForExercise(week(2), 'V2-T4'), 'improve your skills');
  assert.equal(termForExercise(week(2), 'V2-T5'), 'look forward to');
  assert.equal(termForExercise(week(3), 'V3-T3'), 'invite (someone) round');
});

test('unlisted forms and object-property names pass through unchanged, with no guessed alias', () => {
  const sample = { text: { items: [
    { id: 'punctuation', key: 'made a big decision.' },
    { id: 'case', key: 'Made a big decision' },
    { id: 'prototype', key: 'constructor' },
  ] } };
  assert.equal(termForExercise(sample, 'punctuation'), 'made a big decision.');
  assert.equal(termForExercise(sample, 'case'), 'Made a big decision');
  assert.equal(termForExercise(sample, 'prototype'), 'constructor');
});

test('a type-the-word item links to the word being typed', () => {
  const item = week(1).typeTheWord.items[0];
  assert.equal(termForExercise(week(1), item.id), item.key);
});

test('a collocation or word-form item links to nothing, because it is not a vocabulary word', () => {
  // "make progress" is a collocation practised with a verb the week's list does
  // not contain. Inventing a card for it would put an unreviewed word in Review.
  for (const item of week(1).chooseVerb) {
    assert.equal(termForExercise(week(1), item.id), null, item.id);
  }
  for (const item of week(1).wordForms) {
    assert.equal(termForExercise(week(1), item.id), null, item.id);
  }
});

test('an unknown id links to nothing rather than throwing', () => {
  assert.equal(termForExercise(week(1), 'NOPE-1'), null);
  assert.equal(findExerciseItem(week(1), 'NOPE-1'), null);
});

test('every week links its matching, gap-fill and typed answers to a term', () => {
  for (const entry of bank.weeks) {
    const linked = [
      ...entry.match.items.map((item) => item.id),
      ...entry.text.items.map((item) => item.id),
      ...entry.typeTheWord.items.map((item) => item.id),
    ];
    for (const id of linked) {
      const term = termForExercise(entry, id);
      assert.ok(term && term.trim().length > 0, `week ${entry.week}: ${id} has no term`);
    }
  }
});

test('every linked term exists in the weekly vocabulary, which is what gets a card', () => {
  // Coverage is the point: a term with no vocabulary entry gets no card. With
  // the four explicit aliases in place, every matching, gap-fill and typed
  // answer resolves to an authored card — 44 of 44. If this drops, weekly
  // practice is quietly updating fewer cards than it looks like it is.
  const authored = new Set();
  for (const entry of details.weeks) {
    for (const group of ['core', 'collocations', 'optional']) {
      for (const word of entry.vocabulary[group]) {
        if (word.example) authored.add(word.target.toLowerCase());
      }
    }
  }
  let total = 0;
  let covered = 0;
  for (const entry of bank.weeks) {
    const ids = [
      ...entry.match.items.map((item) => item.id),
      ...entry.text.items.map((item) => item.id),
      ...entry.typeTheWord.items.map((item) => item.id),
    ];
    for (const id of ids) {
      total += 1;
      // The database lookup (updateReviewFromWeeklyPractice) compares with a
      // trim + lower-case ilike, so that is the comparison to pin here.
      // normaliseTerm also strips a trailing ")", which is part of the term in
      // "catch up (with)" and "awkward (situation)".
      const term = termForExercise(entry, id);
      if (authored.has(String(term).trim().toLocaleLowerCase('en-GB'))) covered += 1;
    }
  }
  assert.equal(covered, total, `only ${covered}/${total} linked words can get a card`);
});

test('term normalisation matches the way the database compares terms', () => {
  assert.equal(normaliseTerm('  Look Back On. '), 'look back on');
  assert.equal(normaliseTerm('get used to'), 'get used to');
  assert.equal(normaliseTerm('“Genuinely”'), 'genuinely');
});

test('a weekly mistake grades Again and a correct answer grades Good', () => {
  const route = read('lib/b1b2/week-vocab-review.ts');
  assert.match(route, /const grade = correct \? 'good' : 'again';/);
  // It must not hard-code a grade, which would make every answer look the same.
  assert.equal(/p_grade: 'good'/.test(route), false);
});

test('weekly practice never creates a duplicate card', () => {
  const route = read('lib/b1b2/week-vocab-review.ts');
  assert.match(route, /onConflict: 'user_id,vocab_item_id,card_kind'/);
  assert.match(route, /ignoreDuplicates: true/);
});

test('a failed review update cannot fail the learner’s answer', () => {
  const route = read('src/app/api/week/vocabulary/mark/route.ts');
  const call = route.slice(route.indexOf('updateReviewFromWeeklyPractice'));
  // The attempt and the feedback are returned regardless of what the card did.
  assert.ok(call.indexOf('return NextResponse.json(result') > -1);
  const reviewModule = read('lib/b1b2/week-vocab-review.ts');
  assert.match(reviewModule, /catch \(error\)/);
});
