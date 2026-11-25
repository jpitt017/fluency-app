import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { publicSpeakingSupport, phrasesUsed, splitHighlightedText, validSupportNotes } from '../../lib/curriculum/speaking-support.mjs';

const require = createRequire(import.meta.url);
const support = require('../../supabase-b1-b2/content/curriculum/speaking-support-weeks-01-04.json');
const details = require('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json');
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

for (const item of support.weeks) {
  test(`Week ${item.week} exposes only the learner-facing support and shuffles all six phrases`, () => {
    const projected = publicSpeakingSupport(item, () => 0);
    assert.equal(projected.noticePhrases.length, 6);
    assert.deepEqual(new Set(projected.noticePhrases), new Set([...item.noticePhrases, ...item.distractors]));
    assert.notDeepEqual(projected.noticePhrases, [...item.noticePhrases, ...item.distractors]);
    assert.deepEqual(projected.planNotes, item.planNotes);
    assert.deepEqual(projected.focusQuestion.options, item.focusQuestion.options);
    assert.equal(Object.hasOwn(projected.focusQuestion, 'answerIndex'), false);
    assert.equal(Object.hasOwn(projected.focusQuestion, 'feedback'), false);
    assert.equal(Object.hasOwn(projected, 'voice'), false);
  });

  test(`Week ${item.week} real notice phrases are exact substrings of the model`, () => {
    const model = details.weeks.find((week) => week.number === item.week).speaking.model;
    for (const phrase of item.noticePhrases) {
      assert.ok(model.toLocaleLowerCase('en-GB').includes(phrase.toLocaleLowerCase('en-GB')), `${phrase} must be present verbatim`);
    }
    for (const phrase of item.distractors) {
      assert.ok(!model.toLocaleLowerCase('en-GB').includes(phrase.toLocaleLowerCase('en-GB')), `${phrase} must be a distractor`);
    }
  });
}

test('phrase matching and transcript highlighting handle exact phrases without changing source text', () => {
  const transcript = "Since then, I've made friends. I also think it's quieter than downtown.";
  const phrases = ["Since then, I've", "It's quieter than", 'My goal is to'];
  assert.deepEqual(phrasesUsed(transcript, phrases), ["Since then, I've", "It's quieter than"]);
  assert.deepEqual(splitHighlightedText(transcript, phrases), [
    { text: "Since then, I've", highlighted: true },
    { text: ' made friends. I also think ', highlighted: false },
    { text: "it's quieter than", highlighted: true },
    { text: ' downtown.', highlighted: false },
  ]);
});

test('notes must match every cue point label and are length-limited', () => {
  const labels = ['Before', 'The change'];
  assert.deepEqual(validSupportNotes([
    { label: 'Before', note: 'old routine' },
    { label: 'The change', note: 'new city'.repeat(100) },
  ], labels), [
    { label: 'Before', note: 'old routine' },
    { label: 'The change', note: 'new city'.repeat(75) },
  ]);
  assert.equal(validSupportNotes([{ label: 'wrong', note: 'x' }, { label: 'The change', note: '' }], labels), null);
  assert.equal(validSupportNotes([], labels), null);
});

test('the focus answer key remains server-only and the route returns no answer index', () => {
  const route = read('src/app/api/week/speaking/focus/route.ts');
  assert.match(route, /Number\(choice\) === config\.answerIndex/);
  assert.match(route, /NextResponse\.json\(\{ correct, feedback:/);
  assert.doesNotMatch(route, /answerIndex\s*[,}:]/);
  const projection = read('lib/curriculum/week-speaking-support.ts');
  assert.match(projection, /focusQuestion: unlocked \? \{/);
  assert.match(projection, /projection\.focusQuestion\.options/);
  assert.match(projection, /model: unlocked \? \{ text:/);
  assert.match(projection, /realPhrases: attempt && attempt\.notice_selected !== null \? config\.noticePhrases : \[\]/);
  const returnedState = projection.slice(projection.indexOf('  return {'), projection.indexOf('\n  };', projection.indexOf('  return {')));
  assert.doesNotMatch(returnedState, /answerIndex/);
});

test('the week page does not serialize the model before the server-side attempt gate', () => {
  const learnerWeek = read('lib/curriculum/learner-week.ts');
  assert.doesNotMatch(learnerWeek, /speakingModel:\s*\{/);
  const page = read('src/app/week/[n]/page.tsx');
  assert.doesNotMatch(page, /details\.speakingModel/);
  assert.match(page, /loadWeekSpeakingSupport\(number\)/);
});

test('migration and delete-data RPC cover notes, answers, and both stored recording paths', () => {
  const migration = read('supabase-b1-b2/migrations/0060_week_speaking_support.sql');
  for (const column of ['notes', 'focus_choice', 'focus_correct', 'notice_selected', 'first_recording_path', 'second_recording_path']) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  assert.match(migration, /array\[first_recording_path, second_recording_path\]/);
  assert.match(migration, /delete from public\.week_speaking_attempts/);
  assert.match(migration, /delete_my_learning_data\(\)/);
});
