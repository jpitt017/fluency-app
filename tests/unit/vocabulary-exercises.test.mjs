import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectVocabularyExercises } from '../../lib/curriculum/vocabulary-exercise-projection.mjs';

const bank = JSON.parse(readFileSync(new URL('../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json', import.meta.url)));

test('v2 exercises have the requested item counts and valid private keys', () => {
  assert.equal(bank.version, 'v2');
  assert.equal(bank.rules.markedItemsPerWeek, 18);
  assert.equal(bank.rules.aiUnitsPerSentence, 2);
  assert.equal(bank.rules.affectsUnlocking, false);
  assert.match(bank.rules.typeTheWord, /one wrong letter/);
  assert.deepEqual(bank.weeks.map(w => w.week), [1, 2, 3, 4]);
  const allIds = new Set();
  for (const week of bank.weeks) {
    assert.deepEqual([week.match.items.length, week.text.items.length, week.chooseVerb.length, week.wordForms.length, week.typeTheWord.items.length, week.yourSentence.length], [3, 5, 3, 2, 3, 2]);
    for (const item of [...week.match.items, ...week.text.items, ...week.chooseVerb, ...week.wordForms, ...week.typeTheWord.items, ...week.yourSentence]) {
      assert.ok(!allIds.has(item.id), item.id); allIds.add(item.id);
      assert.match(item.id, new RegExp(`^V${week.week}-`));
    }
    for (const item of week.text.items) assert.ok(week.text.wordBox.includes(item.key));
    for (const item of [...week.chooseVerb, ...week.wordForms]) assert.ok(item.answer_index >= 0 && item.answer_index < item.options.length);
    for (const item of week.typeTheWord.items) assert.ok(item.accept.includes(item.key));
    assert.ok(week.careful.every(item => item.target && item.note));
  }
});

test('initial learner projection omits secret answer fields, models and paired matches', () => {
  for (const week of bank.weeks) {
    const projected = projectVocabularyExercises(week);
    const json = JSON.stringify(projected);
    for (const field of ['key', 'accept', 'answer_index', 'reason', 'model', 'onTargetWhen', 'notUsed']) {
      assert.ok(!json.includes(`"${field}":`), `${field} leaked in week ${week.week}`);
    }
    // Some keys are intentionally displayed in the word box or other prompts.
    // These recall keys are not: they are leak sentinels for each week's JSON.
    const sentinelIndex = week.week === 2 ? 1 : 0;
    const keySentinel = week.typeTheWord.items[sentinelIndex].key;
    assert.ok(!json.includes(keySentinel), `Week ${week.week} leaked a recall key`);
    assert.ok(JSON.stringify({ ...projected, key: keySentinel }).includes(keySentinel));
    // A free-text model is not a selectable option and must never be serialized.
    const sentinel = week.yourSentence[0].model;
    assert.ok(!json.includes(sentinel), `Week ${week.week} leaked a model`);
    assert.ok(JSON.stringify({ ...projected, model: sentinel }).includes(sentinel), 'sentinel detects a leak');
    for (const item of projected.match.words) assert.deepEqual(Object.keys(item).sort(), ['id', 'word']);
    assert.deepEqual(projected.match.meanings, [...projected.match.meanings].sort());
    assert.deepEqual(projected.careful, week.careful);
  }
});


test('match meanings equal the matching week and target card definition', () => {
  const definitions = JSON.parse(readFileSync(new URL('../../lib/curriculum/vocabulary-meanings.json', import.meta.url)));
  for (const week of bank.weeks) for (const item of week.match.items) {
    const group = definitions.weeks.find(group => group.week === week.week);
    const card = group?.definitions.find(entry => entry.target === item.word);
    assert.ok(card, `Missing definition for ${item.word} in week ${week.week}`);
    assert.equal(item.meaning, card.definition, item.id);
  }
});

test('server marking covers all fixed items and typed recall spelling rules', async () => {
  const { markVocabularyAnswer } = await import('../../lib/curriculum/vocabulary-marking.mjs');
  for (const week of bank.weeks) {
    for (const item of week.match.items) assert.equal(markVocabularyAnswer(week, item.id, item.meaning).correct, true);
    for (const item of week.text.items) assert.equal(markVocabularyAnswer(week, item.id, item.key).correct, true);
    for (const item of [...week.chooseVerb, ...week.wordForms]) {
      assert.equal(markVocabularyAnswer(week, item.id, item.options[item.answer_index]).correct, true);
      assert.equal(markVocabularyAnswer(week, item.id, item.options[(item.answer_index + 1) % item.options.length]).correct, false);
    }
    for (const item of week.typeTheWord.items) for (const answer of item.accept) {
      assert.equal(markVocabularyAnswer(week, item.id, `  ${answer.toUpperCase()}  `).correct, true);
    }
  }
  const week = bank.weeks[0];
  assert.deepEqual(markVocabularyAnswer(week, 'V1-R2', 'regert'), { correct: false, nearly: false, feedback: 'Not quite. The answer is: regret' });
  assert.deepEqual(markVocabularyAnswer(week, 'V1-R2', 'regat'), { correct: false, nearly: false, feedback: 'Not quite. The answer is: regret' });
  assert.deepEqual(markVocabularyAnswer(week, 'V1-R2', 'regretx'), { correct: true, nearly: true, feedback: 'Nearly! Check the spelling: regret' });
  assert.equal(markVocabularyAnswer(week, 'V1-R1', 'toke up').correct, false, 'short words do not qualify');
  assert.equal(markVocabularyAnswer(bank.weeks[1], 'V2-R2', 'work toward').correct, true);
  assert.throws(() => markVocabularyAnswer(week, 'V1-S1', 'answer'), /not found/);
});
