import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scorePlacement } from '../../lib/b1b2/placement-scoring.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/placement-questions-v2.json', import.meta.url)));
const migration = readFileSync(new URL('../../supabase-b1-b2/migrations/0028_placement_questions_v2.sql', import.meta.url), 'utf8');

test('migration contains the exact supplied question and text data', () => {
  const bank = JSON.parse(migration.split('$bank$')[1]);
  assert.deepEqual(bank.questions, fixture.questions);
  assert.deepEqual(bank.texts, fixture.texts);
  assert.equal(bank.questions.length, 24);
  assert.equal(bank.texts.length, 2);
});

test('score boundaries and validation', () => {
  const key = fixture.questions.map((q) => q.answer_index);
  for (const [score, placement] of [[0, 'foundation'], [11, 'foundation'], [12, 'stage1'], [18, 'stage1'], [19, 'stage2'], [24, 'stage2']]) {
    const answers = key.map((answer, index) => index < score ? answer : (answer + 1) % 4);
    assert.deepEqual(scorePlacement(answers, key), { score, total: 24, placement });
  }
  assert.throws(() => scorePlacement([], key));
  assert.throws(() => scorePlacement(key, key.slice(1)));
  assert.throws(() => scorePlacement(key.map(() => 4), key));
});
