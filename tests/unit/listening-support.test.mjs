import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRIVATE_FIELDS,
  containsPrivateField,
  markGloss,
  projectSupport,
  supportFor,
} from '../../lib/curriculum/listening-support.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const content = JSON.parse(read('supabase-b1-b2/content/curriculum/listening-support-weeks-01-04.json'));
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const scriptFor = (week) => details.listening.weeks.find((entry) => entry.week === week).script;

const WEEKS = [1, 2, 3, 4];

test('the pilot content keeps the shape the page relies on', () => {
  assert.deepEqual(content.weeks.map((week) => week.week), WEEKS);
  for (const week of content.weeks) {
    assert.equal(week.keyWords.length, 2, `week ${week.week} has two key words`);
    assert.equal(week.glosses.length, 7, `week ${week.week} has seven glosses`);
    assert.equal(week.glossCheck.length, 4, `week ${week.week} has a four-item gloss check`);
    for (const item of week.glossCheck) {
      assert.ok(Number.isInteger(item.answerIndex), 'answerIndex is an integer');
      assert.ok(item.answerIndex >= 0 && item.answerIndex < item.options.length, 'answerIndex is in range');
      assert.ok(item.feedback.trim().length > 0, 'every item has one-line feedback');
    }
    for (const meaning of [...week.keyWords, ...week.glosses]) {
      assert.ok(
        meaning.meaning.split(/\s+/).length <= content.rules.definitionMaxWords,
        `"${meaning.meaning}" is within the ${content.rules.definitionMaxWords}-word definition rule`,
      );
    }
  }
});

test('every gloss phrase and card word really appears in that week’s script', () => {
  for (const week of content.weeks) {
    const script = scriptFor(week.week).toLowerCase();
    for (const gloss of week.glosses) {
      assert.ok(script.includes(gloss.tap.toLowerCase()), `week ${week.week}: "${gloss.tap}" is in the script`);
    }
    for (const word of week.cardWords) {
      assert.ok(script.includes(word.toLowerCase()), `week ${week.week}: "${word}" is in the script`);
    }
  }
});

test('the projection carries no answer key, for any week', () => {
  for (const week of WEEKS) {
    const projected = projectSupport(content, week, { script: scriptFor(week) });
    assert.equal(containsPrivateField(projected), false, `week ${week} projection leaks a private field`);
    // The exact field named in the brief, serialized the way the page sends it.
    assert.equal(JSON.stringify(projected).includes('answerIndex'), false);
    assert.equal(JSON.stringify(projected).includes('answer_index'), false);
    // The feedback is written as an explanation of the right answer, so it is a
    // private field too: it is only sent once an answer has been chosen.
    for (const item of projected.glossCheck) {
      assert.deepEqual(Object.keys(item).sort(), ['id', 'options', 'stem']);
    }
  }
});

test('the transcript is rebuilt losslessly and marks every gloss and card word', () => {
  for (const week of content.weeks) {
    const script = scriptFor(week.week);
    const projected = projectSupport(content, week.week, { script });

    assert.equal(projected.transcript.map((segment) => segment.text).join(''), script, 'text is unchanged');

    const markedGlosses = new Set(projected.transcript.filter((s) => s.gloss).map((s) => s.gloss));
    for (const gloss of week.glosses) {
      assert.ok(markedGlosses.has(gloss.tap), `week ${week.week}: "${gloss.tap}" is tappable`);
    }
    const markedCards = new Set(projected.transcript.filter((s) => s.card).map((s) => s.card));
    for (const word of week.cardWords) {
      assert.ok(markedCards.has(word), `week ${week.week}: "${word}" is highlighted as a card word`);
    }
    // A segment is one or the other, never both: two colours on one word would
    // be unreadable and impossible to announce sensibly.
    assert.equal(projected.transcript.filter((s) => s.gloss && s.card).length, 0);
  }
});

test('a gloss phrase is not swallowed by a shorter overlapping one', () => {
  const projected = projectSupport(content, 1, { script: scriptFor(1) });
  // "get used to" is a card word and "used to" appears inside it; the longer
  // phrase must win, and the text between them must stay plain.
  const cards = projected.transcript.filter((segment) => segment.card).map((segment) => segment.card);
  assert.ok(cards.includes('get used to'));
  assert.equal(
    projected.transcript.some((segment) => segment.card === 'used to'),
    false,
    'the shorter fragment is not marked separately',
  );
});

test('card words carry the vocabulary step meaning, and degrade without one', () => {
  const withMeanings = projectSupport(content, 1, {
    script: scriptFor(1),
    cardMeanings: { challenge: 'a difficult thing to deal with' },
  });
  assert.equal(
    withMeanings.cardWords.find((word) => word.word === 'challenge').meaning,
    'a difficult thing to deal with',
  );
  // "get used to" has a genuine entry; "Gradually" is capitalised in the content,
  // and a missing entry must still explain itself on tap rather than show ''.
  for (const word of withMeanings.cardWords) {
    assert.ok(word.meaning.trim().length > 0, `${word.word} has a meaning to show`);
  }
});

test('marking a gloss item reports the verdict, the right answer and the feedback', () => {
  const item = content.weeks[0].glossCheck[0];
  const right = markGloss(content, 1, 'gloss-1-1', item.options[item.answerIndex]);
  assert.equal(right.correct, true);
  assert.equal(right.answer, item.options[item.answerIndex]);
  assert.equal(right.feedback, item.feedback);

  const wrongOption = item.options.find((option) => option !== item.options[item.answerIndex]);
  const wrong = markGloss(content, 1, 'gloss-1-1', wrongOption);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.answer, item.options[item.answerIndex]);
});

test('every gloss item in every week can be marked both ways', () => {
  for (const week of content.weeks) {
    week.glossCheck.forEach((item, index) => {
      const id = `gloss-${week.week}-${index + 1}`;
      const key = item.options[item.answerIndex];
      assert.equal(markGloss(content, week.week, id, key).correct, true);
      for (const option of item.options.filter((value) => value !== key)) {
        assert.equal(markGloss(content, week.week, id, option).correct, false);
      }
    });
  }
});

test('a bad item or a choice that is not offered is refused, not marked wrong', () => {
  assert.throws(() => markGloss(content, 1, 'gloss-1-99', 'anything'), /not available/);
  assert.throws(() => markGloss(content, 9, 'gloss-9-1', 'anything'), /not available/);
  assert.throws(() => markGloss(content, 1, 'gloss-1-1', 'not an option'), /choose one/);
  assert.throws(() => markGloss(content, 1, 'gloss-1-1', ''), /choose one/);
  // An id from another week is not a valid id for this one.
  assert.throws(() => markGloss(content, 2, 'gloss-1-1', 'anything'), /not available/);
});

test('a week with no support content projects to null rather than a half-empty object', () => {
  assert.equal(projectSupport(content, 9, { script: '' }), null);
  assert.equal(supportFor(content, 9), null);
  assert.equal(supportFor(content, 1).week, 1);
});

test('the private-field list covers both spellings of the answer index', () => {
  assert.ok(PRIVATE_FIELDS.includes('answerIndex'));
  assert.ok(PRIVATE_FIELDS.includes('answer_index'));
  assert.equal(containsPrivateField({ nested: [{ answerIndex: 1 }] }), true);
  assert.equal(containsPrivateField({ nested: [{ stem: 'x' }] }), false);
});
