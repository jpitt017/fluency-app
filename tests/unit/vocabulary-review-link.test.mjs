import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normaliseTerm, termForExercise, findExerciseItem } from '../../lib/curriculum/vocabulary-review-link.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const bank = JSON.parse(read('supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json'));
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const week = (n) => bank.weeks.find((entry) => entry.week === n);

test('a match item links to the word being matched', () => {
  const item = week(1).match.items[0];
  assert.equal(termForExercise(week(1), item.id), item.word);
});

test('a gap-fill item links to the word that fills the gap', () => {
  const item = week(1).text.items[0];
  assert.equal(termForExercise(week(1), item.id), item.key);
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

test('most linked terms exist in the weekly vocabulary, which is what gets a card', () => {
  // Coverage is the point: a term with no vocabulary entry gets no card, so the
  // share that does is worth pinning. If this drops, weekly practice is quietly
  // updating fewer cards than it looks like it is.
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
      if (authored.has(normaliseTerm(termForExercise(entry, id)))) covered += 1;
    }
  }
  assert.ok(covered / total >= 0.85, `only ${covered}/${total} linked words can get a card`);
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
  const module = read('lib/b1b2/week-vocab-review.ts');
  assert.match(module, /catch \(error\)/);
});
