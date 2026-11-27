import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  containsPrivateField,
  markReadingGloss,
  projectReadingSupport,
} from '../../lib/curriculum/reading-support.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const content = JSON.parse(read('supabase-b1-b2/content/curriculum/reading-support-weeks-01-04.json'));
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const vocab = JSON.parse(read('lib/curriculum/vocabulary-meanings.json'));
const weeks = [1, 2, 3, 4];
const readingFor = (week) => details.reading.weeks.find((entry) => entry.week === week);
const meaningsFor = (week) => Object.fromEntries(
  vocab.weeks.find((entry) => entry.week === week).definitions.map((entry) => [entry.target.toLowerCase(), entry.definition]),
);

test('reading pilot has two key words, six glosses and four optional check items per week', () => {
  assert.deepEqual(content.weeks.map((week) => week.week), weeks);
  for (const week of content.weeks) {
    assert.equal(week.keyWords.length, 2, `week ${week.week}`);
    assert.equal(week.glosses.length, 6, `week ${week.week}`);
    assert.equal(week.glossCheck.length, 4, `week ${week.week}`);
    for (const item of week.glossCheck) {
      assert.ok(Number.isInteger(item.answerIndex));
      assert.ok(item.answerIndex >= 0 && item.answerIndex < item.options.length);
      assert.ok(item.feedback.trim());
    }
    for (const entry of [...week.keyWords, ...week.glosses]) {
      assert.ok(entry.meaning.split(/\s+/).length <= content.rules.definitionMaxWords, entry.word ?? entry.tap);
    }
  }
});

test('each highlighted reading word and gloss is present in its existing passage', () => {
  for (const source of content.weeks) {
    const sourceText = readingFor(source.week).text;
    const projected = projectReadingSupport(content, source.week, { text: sourceText });
    assert.equal(projected.text.map((segment) => segment.text).join(''), sourceText);
    for (const { tap } of source.glosses) assert.ok(sourceText.toLowerCase().includes(tap.toLowerCase()), `week ${source.week}: ${tap}`);
    for (const { text: word } of source.cardWords) assert.ok(sourceText.toLowerCase().includes(word.toLowerCase()), `week ${source.week}: ${word}`);
  }
});

test('the pre-question page projection contains no card meanings, even as hidden fields', () => {
  for (const source of content.weeks) {
    const serialized = JSON.stringify(projectReadingSupport(content, source.week, {
      text: readingFor(source.week).text,
      predict: readingFor(source.week).predict,
      cardMeanings: meaningsFor(source.week),
      questionsAnswered: false,
    }));
    for (const definition of Object.values(meaningsFor(source.week))) assert.equal(serialized.includes(definition), false, `week ${source.week}: leaked ${definition}`);
    const projection = JSON.parse(serialized);
    assert.ok(projection.cardWords.every((word) => !Object.hasOwn(word, 'meaning')));
    assert.equal(projection.glossCheck.some((item) => Object.hasOwn(item, 'answerIndex')), false);
    assert.equal(containsPrivateField(projection), false);
  }
});

test('server-authorized post-question projection opens card meanings and keeps the card words marked', () => {
  for (const source of content.weeks) {
    const projected = projectReadingSupport(content, source.week, {
      text: readingFor(source.week).text,
      cardMeanings: meaningsFor(source.week),
      questionsAnswered: true,
    });
    for (const word of projected.cardWords) assert.ok(word.meaning, `${word.word} has a card meaning`);
    assert.equal(projected.text.map((segment) => segment.text).join(''), readingFor(source.week).text);
    assert.equal(projected.glossCheck.length, 4);
    assert.equal(JSON.stringify(projected).includes('answerIndex'), false);
  }
});

test('gloss answers are marked from the server key, while an index never enters the projection', () => {
  for (const week of content.weeks) {
    week.glossCheck.forEach((item, index) => {
      const id = `gloss-${week.week}-${index + 1}`;
      const correct = item.options[item.answerIndex];
      const marked = markReadingGloss(content, week.week, id, correct);
      assert.deepEqual(marked, { correct: true, answer: correct, feedback: item.feedback });
      const wrong = item.options.find((option) => option !== correct);
      assert.equal(markReadingGloss(content, week.week, id, wrong).correct, false);
    });
  }
  assert.throws(() => markReadingGloss(content, 1, 'gloss-1-99', 'anything'), /not available/);
  assert.throws(() => markReadingGloss(content, 1, 'gloss-1-1', 'not an option'), /choose one/);
});

test('the page gate reads saved reading answers on the server and unlocks only when every question is checked', () => {
  const loader = read('lib/curriculum/learner-week.ts');
  const gate = loader.slice(loader.indexOf('async function loadReadingSupport'), loader.indexOf('async function loadListeningSupport'));
  assert.match(gate, /from\('week_input_answers'\)/);
  assert.match(gate, /\.eq\('user_id', user\.id\)/);
  assert.match(gate, /\.eq\('week_number', weekNumber\)/);
  assert.match(gate, /\.eq\('skill', 'reading'\)/);
  assert.match(gate, /questionsAnswered = questions\.length > 0 && answered === questions\.length/);
  assert.match(gate, /cardMeanings: cardMeanings\(weekNumber, cardTerms\)/);
  assert.match(gate, /questionsAnswered,\s*\}/);
  assert.match(gate, /glossCheck: questionsAnswered \? support\.glossCheck : null/);
});

test('the gloss-check route enforces the question gate and saves only deletable answer rows', () => {
  const route = read('src/app/api/week/reading/gloss/route.ts');
  assert.ok(route.includes('questionIds.every((id) => savedIds.has(id))'));
  assert.match(route, /from\('syllabus_input_items_safe'\)/);
  assert.ok(route.indexOf('questions.every') < route.indexOf('marked = markReadingGloss'));
  assert.match(route, /skill:\s*'reading'/);
  assert.match(route, /from\('week_input_answers'\)[\s\S]*?\.upsert\(/);
  assert.equal(route.includes('week_input_submissions'), false, 'gloss checks must not create unlock submissions');
  assert.equal(/answerIndex\s*[,}:]/.test(route.slice(route.indexOf('return NextResponse.json(\n    { correct'))), false);
  const deletion = read('supabase-b1-b2/migrations/0044_repair_deletion_function.sql');
  assert.match(deletion, /week_input_answers/);
  assert.match(read('supabase-b1-b2/migrations/0043_week_input_answers.sql'), /delete from public\.week_input_answers/);
});

test('the page uses the shared, keyboard-operable gloss and gloss-check components', () => {
  const component = read('components/b1b2/ReadingSupport.tsx');
  assert.match(component, /import \{ GlossCheck, TapWord \} from '@\/components\/b1b2\/ListeningSupport'/);
  assert.match(component, /endpoint="\/api\/week\/reading\/gloss"/);
  assert.match(component, /Go further \(2–3 min\)/);
  assert.match(component, /card\?\.meaning/);
  assert.match(component, /decoration-emerald-500/);

  const page = read('src/app/week/[n]/page.tsx');
  // The one-task accordion walks the page in the order the finish buttons
  // already used: grammar → vocabulary → reading → listening → speaking →
  // writing, so vocabulary now precedes reading (vocabulary's finish button
  // says "Next: Reading →").
  const taskMap = read('lib/curriculum/week-tasks.mjs');
  const vocabularyIndex = taskMap.indexOf("key: 'vocabulary'");
  const readingIndex = taskMap.indexOf("key: 'reading'");
  assert.ok(vocabularyIndex >= 0 && readingIndex > vocabularyIndex);
  assert.match(page, /<VocabularyPractice/);
  assert.match(page, /cards && vocabulary/);
  assert.match(page, /<ReadingPracticeLayout/);
  assert.doesNotMatch(page, /Finish and save the reading questions first/);
  assert.match(component, /Answer the reading questions first to open the card-word meanings and gloss check/);
});
