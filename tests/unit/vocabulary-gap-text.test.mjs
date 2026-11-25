import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGapText, gapsCoverItems } from '../../lib/curriculum/vocabulary-gap-text.mjs';
import { projectVocabularyExercises } from '../../lib/curriculum/vocabulary-exercise-projection.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const bank = JSON.parse(read('supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json'));

test('every week body parses into its five gaps, in order, with the text intact', () => {
  for (const week of bank.weeks) {
    const segments = parseGapText(week.text.body, week.text.items);
    assert.ok(gapsCoverItems(segments, week.text.items), `week ${week.week}`);
    const gaps = segments.filter((segment) => segment.type === 'gap');
    assert.deepEqual(gaps.map((segment) => segment.gap), [1, 2, 3, 4, 5]);
    assert.deepEqual(
      gaps.map((segment) => segment.id),
      week.text.items.map((item) => item.id),
    );
    // Putting the markers back reproduces the authored body exactly: nothing
    // around the gaps is dropped or rewritten.
    const rebuilt = segments
      .map((segment) => (segment.type === 'text' ? segment.text : `(${segment.gap}) ___`))
      .join('');
    assert.equal(rebuilt, week.text.body);
  }
});

test('a marker with no bank item stays literal text and fails the completeness check', () => {
  const items = [{ id: 'X-T1', gap: 1 }];
  const segments = parseGapText('One (1) ___ and two (2) ___.', items);
  assert.ok(!gapsCoverItems(segments, items.concat({ id: 'X-T2', gap: 2 })));
  const joined = segments.map((segment) => (segment.type === 'text' ? segment.text : `(${segment.gap}) ___`)).join('');
  assert.equal(joined, 'One (1) ___ and two (2) ___.');
  // The known gap is interactive; the unknown marker is text.
  assert.equal(segments.filter((segment) => segment.type === 'gap').length, 1);
});

test('one Check can explain every gap: each item has an authored reason the marker returns', async () => {
  const { markVocabularyAnswer } = await import('../../lib/curriculum/vocabulary-marking.mjs');
  for (const week of bank.weeks) {
    for (const item of week.text.items) {
      assert.ok(typeof item.reason === 'string' && item.reason.length > 10, `${item.id} reason`);
      const right = markVocabularyAnswer(week, item.id, item.key);
      assert.equal(right.correct, true);
      assert.equal(right.feedback, item.reason, `${item.id} explains the right answer`);
      const wrongWord = week.text.wordBox.find((word) => word !== item.key);
      const wrong = markVocabularyAnswer(week, item.id, wrongWord);
      assert.equal(wrong.correct, false);
      assert.equal(wrong.feedback, item.reason, `${item.id} explains the gap after a wrong pick too`);
    }
  }
});

test('the reasons stay on the server: the learner projection carries ids and gaps only', () => {
  for (const week of bank.weeks) {
    const projected = projectVocabularyExercises(week);
    const json = JSON.stringify(projected);
    assert.ok(!json.includes('"reason"'), `week ${week.week} leaked a reason`);
    assert.ok(!json.includes('"key"'), `week ${week.week} leaked a key`);
    for (const item of week.text.items) {
      assert.ok(!json.includes(item.reason), `week ${week.week} leaked ${item.id}'s reason text`);
    }
    for (const item of projected.text.items) {
      assert.deepEqual(Object.keys(item).sort(), ['gap', 'id']);
    }
  }
});

test('the gap UI keeps the server marking, the keyboard path and the phone panel', () => {
  const source = read('components/b1b2/GapText.tsx');
  // Marking stays on the server: one request per gap to the same route.
  assert.match(source, /\/api\/week\/vocabulary\/mark/);
  assert.ok(!source.includes('item.key'), 'the component never sees an answer key');
  // Keyboard: Escape closes and focus returns to the gap; opening focuses a word.
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /closeBox\(true, gap\)/);
  assert.match(source, /target\?\.focus\(\)/);
  // Screen reader: the box is a labelled dialog, gaps are described by results,
  // and one polite status announces the score.
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-label=\{`Word box for gap \$\{gap\}`\}/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /aria-describedby=\{mark \|\| error \? resultId : undefined\}/);
  assert.match(source, /role="status"/);
  // The word box is phrasing content inside the paragraph, not an invalid div.
  assert.match(source, /<span\s+ref=\{boxRef\}/);
  // An in-flight mark must not be paired with a newly changed word.
  assert.match(source, /data-testid=\{`gap-button-\$\{gap\}`\}\s+disabled=\{busy\}/);
  assert.match(source, /if \(item\) onChanged\(item\.id\)/);
  // Used words are greyed out and cannot be picked; Remove word frees one.
  assert.match(source, /disabled=\{usedIn !== null\}/);
  assert.match(source, /used in gap/);
  assert.match(source, /Remove word/);
  // The word box is a fixed panel on a phone, anchored to the gap on wider screens.
  assert.match(source, /fixed inset-x-3 bottom-3/);
  assert.match(source, /sm:absolute/);
});

test('step 3 renders the inline gap text, not a list of separate gap questions', () => {
  const source = read('components/b1b2/VocabularyPractice.tsx');
  assert.match(source, /import GapText from '\.\/GapText'/);
  assert.match(source, /gapTextReady && \(/);
  assert.match(source, /<div hidden=\{step !== 2\}>/);
  assert.match(source, /<GapText\s+week=\{exercises\.week\}\s+text=\{exercises\.text\}/);
  // Editing a checked gap removes its previous mark until it is checked again.
  assert.match(source, /onChanged=\{\(id\) => setResults\([\s\S]*?delete next\[id\]/);
  // The old separate-question rendering is kept only as the mismatched-bank fallback.
  assert.match(source, /step !== 2 \|\| !gapTextReady/);
});
