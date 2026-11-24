import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normaliseSentence,
  splitSentences,
  praiseFor,
  normaliseFeedback,
  reviewCardFor,
} from '../../lib/curriculum/free-text-marking.mjs';

test('an authored answer is accepted in both contract and full forms', () => {
  // This is what the route actually does: compare against the authored answers.
  // The earlier design tried to deduce the answer from prose like "narrative
  // tenses; present perfect vs past simple", and rejected all 20 authored keys.
  const accepted = ["I've been learning English since 2020.", 'I have been learning English since 2020.'];
  const pool = accepted.map(normaliseSentence);
  assert.ok(pool.includes(normaliseSentence("I've been learning English since 2020.")));
  assert.ok(pool.includes(normaliseSentence('I have been learning English since 2020.')));
  assert.ok(pool.includes(normaliseSentence("I've been learning English since 2020")));
  assert.ok(!pool.includes(normaliseSentence('I started learning English in 2020.')));
});

test('every authored rewrite in the course has a concrete answer to accept', () => {
  const details = JSON.parse(
    readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url)),
  );
  const isProse = (key) => /^(any|correct|a correct|two |one )/i.test(key.trim());
  let rewrites = 0;
  for (const week of details.weeks) {
    for (const item of week.grammar.practice.items.filter((entry) => entry.step === 'Rewrite')) {
      rewrites += 1;
      assert.ok(!isProse(item.key), `${item.id} has a prose key, not an answer`);
      assert.ok(
        [item.key, ...(item.accepted ?? [])].every((form) => typeof form === 'string' && form.trim()),
        `${item.id} has an empty accepted answer`,
      );
    }
  }
  assert.equal(rewrites, 12);
});

test('every vocabulary sentence has a model answer the box can check against', () => {
  const bank = JSON.parse(
    readFileSync(new URL('../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json', import.meta.url)),
  );
  let sentences = 0;
  for (const week of bank.weeks) {
    for (const sentence of week.yourSentence) {
      sentences += 1;
      assert.ok(sentence.model.trim(), `${sentence.id} has no model answer`);
      assert.ok(sentence.onTargetWhen.trim(), `${sentence.id} has no target note for the model`);
    }
  }
  assert.equal(sentences, 8);
});

test('a "Use it" sentence has no key, so the model is what judges it', () => {
  const details = JSON.parse(
    readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url)),
  );
  const useIt = details.weeks.flatMap((week) => week.grammar.practice.items.filter((item) => item.step === 'Use it'));
  assert.equal(useIt.length, 8);
  for (const item of useIt) {
    // The key is an instruction to the teacher, never an answer to match on.
    assert.match(item.key, /^(Any|Correct|A correct|Two )/);
  }
});

test('sentences split without breaking decimals or abbreviations', () => {
  assert.deepEqual(splitSentences('I used to play. I would sing.'), ['I used to play.', 'I would sing.']);
  assert.deepEqual(splitSentences('It cost 2.5 euros. Then I left.'), ['It cost 2.5 euros.', 'Then I left.']);
  assert.deepEqual(splitSentences('One sentence only'), ['One sentence only']);
});

test('the praise line names the target, and only when it was used', () => {
  assert.match(praiseFor('used to or would', true), /used to or would/);
  assert.equal(praiseFor('used to or would', false), null);
  assert.equal(praiseFor('', true), 'You wrote a clear sentence.');
});

test('feedback always has all three parts even when the model returns nothing', () => {
  const feedback = normaliseFeedback(null, { good: 'Nice one.', corrected: 'I used to swim.', tip: 'Watch the past tense.' });
  assert.deepEqual(feedback, { good: 'Nice one.', corrected: 'I used to swim.', tip: 'Watch the past tense.' });

  const parsed = normaliseFeedback({ good: 'Good.', corrected: '', tip: '' }, { good: 'x', corrected: 'y', tip: 'z' });
  assert.equal(parsed.good, 'Good.');
  assert.equal(parsed.corrected, 'y');
  assert.equal(parsed.tip, 'z');
});

test('a rewrite miss becomes a repair card against the authored sentence', () => {
  const card = reviewCardFor({
    kind: 'rewrite',
    prompt: 'I started learning English in 2020. (since)',
    answer: 'I started English since 2020.',
    corrected: "I've been learning English since 2020.",
    target: 'the present perfect and since',
    category: 'tense',
  });
  assert.equal(card.card_format, 'fix_sentence');
  assert.equal(card.context_sentence, null);
  assert.match(card.corrected_sentence, /since 2020/);
  assert.match(card.explanation, /present perfect and since/);
});

test("a learner's own sentence becomes a cloze card", () => {
  const card = reviewCardFor({
    kind: 'use-it',
    prompt: 'Tell me about something you used to do.',
    answer: 'I use to play football.',
    corrected: 'I used to play football.',
    target: 'used to or would',
  });
  assert.equal(card.card_format, 'cloze');
  assert.equal(card.context_sentence, 'I use to play football.');
  assert.equal(card.category, 'tense');
});

test('no card is created for an empty answer', () => {
  assert.equal(reviewCardFor({ kind: 'rewrite', prompt: 'p', answer: '   ', corrected: 'c', target: 't' }), null);
});
