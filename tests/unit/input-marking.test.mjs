import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markInputAnswer, projectInputQuestions } from '../../lib/curriculum/input-marking.mjs';

const details = JSON.parse(readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url)));

test('server marking validates all reading and listening keys, including annotated true/false', () => {
  for (const skill of ['reading', 'listening']) for (const week of details[skill].weeks) for (const item of week.questions) {
    const annotated = /^(True|False)\s*\((.+)\)$/i.exec(item.key);
    const correct = item.options.includes(item.key) ? item.key : annotated ? annotated[1] : item.key;
    assert.equal(markInputAnswer(item, correct).correct, true, item.id);
    if (annotated) assert.equal(markInputAnswer(item, correct).reason, annotated[2], item.id);
    if (item.options.length) {
      const wrong = item.options.find(option => option !== correct);
      if (wrong) assert.equal(markInputAnswer(item, wrong).correct, false, item.id);
      assert.throws(() => markInputAnswer(item, 'invalid option'), /available answer/);
    } else {
      assert.equal(markInputAnswer(item, `  ${correct.toUpperCase()}  `).correct, true);
      assert.equal(markInputAnswer(item, 'not the answer').correct, false);
    }
  }
});

test('safe projection excludes answer keys and explanations, including free-text sentinels', () => {
  for (const skill of ['reading', 'listening']) for (const week of details[skill].weeks) {
    const projected = JSON.stringify(projectInputQuestions(week.questions));
    for (const field of ['"key"', '"reason"', '"accepted"']) assert.equal(projected.includes(field), false);
    const sentinel = week.questions.find(item => !item.options.length && !projected.toLowerCase().includes(item.key.toLowerCase()));
    assert.ok(sentinel, `${skill} week ${week.week} needs an unseen answer sentinel`);
    assert.ok(!projected.toLowerCase().includes(sentinel.key.toLowerCase()));
    assert.ok(JSON.stringify({ projected, key: sentinel.key }).includes(sentinel.key), 'sentinel catches an intentional leak');
  }
});

test('rejects malformed and inconsistent authored keys instead of scoring the wrong question', () => {
  assert.throws(() => markInputAnswer({ key: 'missing', options: ['yes', 'no'] }, 'yes'), /does not match/);
  assert.throws(() => markInputAnswer({ key: 'yes', options: ['yes', 'no'] }, ''), /answer/);
  assert.deepEqual(markInputAnswer({ key: 'I would (a past habit)', options: ['I would (a past habit)', 'I had'] }, 'I would (a past habit)'), { correct: true, reason: null });
});
