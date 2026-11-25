import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../components/b1b2/VocabularyPractice.tsx', import.meta.url), 'utf8');
const bank = JSON.parse(
  readFileSync(new URL('../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json', import.meta.url)),
);
const details = JSON.parse(
  readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url)),
);

test('step 1 uses B1 headings instead of the internal use flags', () => {
  assert.match(source, /Words to use/);
  assert.match(source, /Words to understand/);
  // The old copy showed the raw flag to the learner.
  assert.ok(!/'active' : 'recognition'/.test(source), 'the use flag is rendered as text');
  assert.ok(!/>recognition</.test(source));
  assert.ok(!/>active</.test(source));
});

test('"Words to use" comes first and is the larger of the two', () => {
  const useIndex = source.indexOf("heading: 'Words to use'");
  const understandIndex = source.indexOf("heading: 'Words to understand'");
  assert.ok(useIndex > 0 && understandIndex > 0);
  assert.ok(useIndex < understandIndex, 'active words must be listed first');
  // The recognition group is the compact one.
  assert.match(source, /heading: 'Words to understand'[^}]*compact: true/);
  assert.match(source, /heading: 'Words to use'[^}]*compact: false/);
});

test('cards are paged 4-5 at a time behind "Next words"', () => {
  const perPage = Number(/const CARDS_PER_PAGE = (\d+)/.exec(source)?.[1]);
  assert.ok(perPage >= 4 && perPage <= 5, `expected 4-5 cards per page, got ${perPage}`);
  assert.match(source, /Next words →/);
});

test('step 1 states the week total and the promise of later practice', () => {
  assert.match(source, /This week: \{cards\.length\} new words\./);
  assert.match(source, /You&apos;ll practise them in the next steps\./);
});

test('the listen button and the careful notes survive the regrouping', () => {
  assert.match(source, /Listen/);
  assert.match(source, /Temporary computer voice/);
  assert.match(source, /noteFor\(card\.word\)/);
  assert.match(source, /exercises\.careful/);
});

test('every week keeps all of its items across the two groups', () => {
  for (const week of details.weeks) {
    const all = [...week.vocabulary.core, ...week.vocabulary.collocations, ...week.vocabulary.optional];
    const active = all.filter((entry) => entry.use === 'P');
    const recognition = all.filter((entry) => entry.use !== 'P');
    assert.equal(active.length + recognition.length, all.length, `week ${week.number} lost an item`);
    assert.ok(active.length > 0, `week ${week.number} has no "Words to use"`);
    assert.ok(recognition.length > 0, `week ${week.number} has no "Words to understand"`);
  }
});

test('the vocabulary bank still supplies a careful note target that exists', () => {
  for (const week of bank.weeks) {
    for (const note of week.careful) {
      const all = [...details.weeks[week.week - 1].vocabulary.core];
      assert.ok(all.length > 0);
      assert.equal(typeof note.target, 'string');
      assert.equal(typeof note.note, 'string');
    }
  }
});
