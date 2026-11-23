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

test('learner data excludes a real secret answer for each week', () => {
  for (const week of details.weeks) {
    const practice = week.grammar.practice;
    const rendered = JSON.stringify(projectLearnerGrammar(practice));
    // Correct multiple-choice options must be displayed as choices, so use an
    // unseen free-text answer as the sentinel for each week instead.
    const item = practice.items.find(entry => entry.step === 'Fix' && typeof entry.key === 'string');
    assert.ok(item, `Week ${week.number} needs a private key sentinel`);
    assert.ok(!rendered.includes(item.key), `Week ${week.number} exposed ${item.id}'s key`);
    const intentionallyLeaky = JSON.stringify({ ...projectLearnerGrammar(practice), key: item.key });
    assert.ok(intentionallyLeaky.includes(item.key), 'the sentinel detects a leak');
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
  assert.equal(meanings.status, 'draft, pending teacher review');
  for (const group of meanings.weeks) for (const entry of group.definitions) {
    assert.ok(entry.definition.trim().split(/\s+/).length < 12, `${entry.target} meaning must have fewer than 12 words`);
  }
  for (const week of details.weeks) {
    for (const item of [...week.vocabulary.core, ...week.vocabulary.collocations, ...week.vocabulary.optional]) {
      assert.ok(meanings.weeks.find(group => group.week === week.number)?.definitions.some(definition => definition.target === item.target), `Week ${week.number}: ${item.target}`);
    }
  }
});

// --- The learner's five steps, and the rules that stay silent -------------

import { coreShare, visibleItems, EXTRA_BELOW, SKIP_REWRITE_AT } from '../../lib/curriculum/grammar-branch.mjs';

const LEARNER_TITLES = ['See it', 'Practise', 'Fix it', 'Use it', 'Remember'];

const stepsFor = (weekNumber) => {
  const week = details.weeks.find((entry) => entry.number === weekNumber);
  const practice = week.grammar.practice;
  const projection = projectLearnerGrammar(practice);
  const targets = new Map(practice.items.map((item) => [item.id, item.target ?? 'Main']));
  // Mirror learner-grammar.ts without importing server-only.
  const definition = [
    { number: 1, title: 'See it', matches: /^(Notice|Meaning)$/ },
    { number: 2, title: 'Practise', matches: /^(Choose|Complete)$/ },
    { number: 3, title: 'Fix it', matches: /^(Fix|Rewrite)$/ },
    { number: 4, title: 'Use it', matches: /^Use it$/ },
    { number: 5, title: 'Remember', matches: /^(Light|Extra|Review)\b/ },
  ];
  return definition
    .map((entry) => ({
      ...entry,
      items: projection.items
        .filter((item) => entry.matches.test(String(item.step)))
        .map((item) => ({ ...item, target: targets.get(item.id) ?? 'Main' })),
    }))
    .filter((entry) => entry.items.length > 0);
};

test('the learner sees five steps, in order, with one B1 instruction each', () => {
  for (const week of details.weeks) {
    const steps = stepsFor(week.number);
    assert.deepEqual(steps.map((entry) => entry.title), LEARNER_TITLES, `Week ${week.number}`);
    for (const step of steps) {
      assert.ok(step.instruction === undefined || step.instruction.length < 100);
    }
  }
});

test('every teacher item and its reason reaches the learner steps, none dropped', () => {
  for (const week of details.weeks) {
    const practice = week.grammar.practice;
    const steps = stepsFor(week.number);
    const mapped = steps.flatMap((step) => step.items.map((item) => item.id));
    assert.equal(mapped.length, practice.items.length, `Week ${week.number} lost an item`);
    assert.deepEqual(new Set(mapped), new Set(practice.items.map((item) => item.id)));
  }
});

test('review items for any earlier week land in Remember', () => {
  const week3 = stepsFor(3);
  const remember = week3.find((step) => step.title === 'Remember');
  const reviewIds = details.weeks[2].grammar.practice.items.filter((i) => i.step.startsWith('Review')).map((i) => i.id);
  assert.ok(reviewIds.length > 0);
  for (const id of reviewIds) assert.ok(remember.items.some((item) => item.id === id), id);
});

test('the branch rules stay silent until every core item is marked', () => {
  const steps = stepsFor(1);
  assert.equal(coreShare(steps, {}), null, 'an unmarked step is not a low score');
  assert.equal(coreShare(steps, { 'W1-M1': true }), null, 'partial answers are not a share');
});

test('below 60% reveals the extra items and keeps the rewrite', () => {
  const steps = stepsFor(1);
  const core = steps[1].items;
  const results = Object.fromEntries(core.map((item, index) => [item.id, index < Math.floor(core.length * EXTRA_BELOW)]));
  assert.ok(coreShare(steps, results) < EXTRA_BELOW);

  const remember = steps.find((step) => step.title === 'Remember');
  const shown = visibleItems(remember, steps, results);
  const extra = remember.items.filter((item) => item.target === 'Extra');
  assert.ok(extra.length > 0, 'Week 1 has extra items to reveal');
  for (const item of extra) assert.ok(shown.some((entry) => entry.id === item.id), item.id);

  const fix = steps.find((step) => step.title === 'Fix it');
  assert.equal(visibleItems(fix, steps, results).length, fix.items.length, 'rewrite stays');
});

test('90% or more skips the rewrite and hides the extra items', () => {
  const steps = stepsFor(1);
  const core = steps[1].items;
  const results = Object.fromEntries(core.map((item) => [item.id, true]));
  assert.equal(coreShare(steps, results), 1);
  assert.ok(1 >= SKIP_REWRITE_AT);

  const fix = steps.find((step) => step.title === 'Fix it');
  const shown = visibleItems(fix, steps, results);
  assert.ok(!shown.some((item) => item.step === 'Rewrite'), 'the rewrite is skipped');
  assert.ok(shown.some((item) => item.step === 'Fix'), 'fix items remain');

  const remember = steps.find((step) => step.title === 'Remember');
  const rememberShown = visibleItems(remember, steps, results);
  assert.ok(!rememberShown.some((item) => item.target === 'Extra'), 'no extra items at 90%');
  assert.ok(rememberShown.some((item) => item.step.startsWith('Review')), 'review stays');
});
