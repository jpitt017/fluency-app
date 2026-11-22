import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markFixedGrammarAnswer, grammarBranch, projectLearnerGrammar } from '../../lib/curriculum/grammar-marking.mjs';

const details = JSON.parse(readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url)));

test('learner projection never includes teacher keys, reasons or models', () => {
  for (const week of details.weeks) {
    const projection = projectLearnerGrammar(week.grammar.practice);
    assert.equal(projection.items.length, week.grammar.practice.items.length);
    const serialised = JSON.stringify(projection);
    for (const property of ['"key"', '"accepted"', '"reason"', '"model"', '"modelAnswer"']) assert.ok(!serialised.includes(property));
    for (const item of week.grammar.practice.items) assert.ok(!serialised.includes(JSON.stringify(item.reason)), item.id);
  }
});

test('fixed questions accept their keys and alternatives and reject wrong answers', () => {
  for (const week of details.weeks) for (const item of week.grammar.practice.items) {
    if (item.step === 'Use it') {
      assert.throws(() => markFixedGrammarAnswer(item, 'My answer'), /AI feedback/);
      continue;
    }
    if (Array.isArray(item.key)) {
      assert.equal(markFixedGrammarAnswer(item, item.key), true, item.id);
      if (item.options.length) assert.equal(markFixedGrammarAnswer(item, item.key.join(' ... ')), true, item.id);
      assert.equal(markFixedGrammarAnswer(item, item.key.map(() => 'incorrect')), false, item.id);
      for (let i = 0; i < item.key.length; i++) for (const alt of item.accepted[i] ?? []) {
        const parts = [...item.key]; parts[i] = alt;
        assert.equal(markFixedGrammarAnswer(item, parts), true, item.id);
      }
    } else {
      assert.equal(markFixedGrammarAnswer(item, item.key), true, item.id);
      for (const alt of item.accepted) {
        // Alternatives outside the provided choices are used when typing, not selectable options.
        if (!item.options.length || item.options.includes(alt)) assert.equal(markFixedGrammarAnswer(item, alt), true, item.id);
      }
      if (item.options.length) {
        const wrong = item.options.find(option => option !== item.key && !item.accepted.includes(option));
        if (wrong) assert.equal(markFixedGrammarAnswer(item, wrong), false, item.id);
        assert.throws(() => markFixedGrammarAnswer(item, 'not an option'), /choose/);
      } else assert.equal(markFixedGrammarAnswer(item, 'incorrect'), false, item.id);
    }
  }
});

test('adaptive decisions are made only after all 11 choose and complete answers', () => {
  const items = details.weeks[0].grammar.practice.items;
  const core = items.filter(i => ['Choose', 'Complete'].includes(i.step));
  assert.equal(core.length, 11);
  assert.equal(grammarBranch(items, {}), null);
  const results = Object.fromEntries(core.map((item, index) => [item.id, index < 6]));
  assert.deepEqual(grammarBranch(items, results), { correct: 6, total: 11, extra: true, skipRewrite: false });
  core.forEach((item, index) => { results[item.id] = index < 10; });
  assert.deepEqual(grammarBranch(items, results), { correct: 10, total: 11, extra: false, skipRewrite: true });
});

test('each week 1–4 vocabulary item has an authored meaning', () => {
  const meanings = JSON.parse(readFileSync(new URL('../../lib/curriculum/vocabulary-meanings.json', import.meta.url)));
  for (const week of details.weeks) {
    for (const item of [...week.vocabulary.core, ...week.vocabulary.collocations, ...week.vocabulary.optional]) {
      assert.ok(meanings[item.target], `Week ${week.number}: ${item.target}`);
    }
  }
});
