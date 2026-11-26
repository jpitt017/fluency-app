import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normaliseSentence } from '../../lib/curriculum/free-text-marking.mjs';

const route = readFileSync(new URL('../../src/app/api/week/sentence/route.ts', import.meta.url), 'utf8');

/**
 * The route decides "correct" by comparing against the authored answers, and
 * falls back to the model when there are none. These tests pin that contract
 * against the real content, because the first implementation got it wrong in a
 * way no unit test would have caught: every authored key was rejected.
 */
const details = JSON.parse(
  readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url)),
);
const bank = JSON.parse(
  readFileSync(new URL('../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json', import.meta.url)),
);

const isProseKey = (key) => /^(any|correct|a correct|two |one )/i.test(key.trim());

/** Mirror of resolveItem's acceptance decision. */
function acceptedFor(item) {
  if (item.step === 'Rewrite') {
    return isProseKey(item.key) ? [] : [item.key, ...(item.accepted ?? [])].filter(Boolean);
  }
  return [];
}

test('a rewrite item accepts its key and every authored alternative', () => {
  const item = details.weeks[0].grammar.practice.items.find((entry) => entry.id === 'W1-R1');
  const accepted = acceptedFor(item).map(normaliseSentence);
  assert.ok(accepted.includes(normaliseSentence("I've been learning English since 2020.")));
  assert.ok(accepted.includes(normaliseSentence('I have been learning English since 2020.')));
  // Properly wrong answers are not in the list, so they go to the model.
  assert.ok(!accepted.includes(normaliseSentence('I started learning English in 2020.')));
});

test('a "Use it" item has no accepted answers, so the model judges it', () => {
  const useIt = details.weeks[0].grammar.practice.items.filter((entry) => entry.step === 'Use it');
  assert.ok(useIt.length > 0);
  for (const item of useIt) assert.deepEqual(acceptedFor(item), []);
});

test('the prose-key guard rejects the authored instruction strings', () => {
  for (const key of ['Any correct sentence with used to or would', 'Correct sentences with going to', 'A correct second conditional', 'Two correctly formed questions']) {
    assert.equal(isProseKey(key), true, `${key} was treated as an answer`);
  }
  for (const key of ["I've been learning English since 2020.", 'You mustn\'t smoke here.']) {
    assert.equal(isProseKey(key), false, `${key} was treated as prose`);
  }
});

test('the route requires an authenticated learner before anything else', () => {
  const authIndex = route.indexOf('await client.auth.getUser()');
  // The call, not the import at the top of the file.
  const markIndex = route.indexOf('await enforceAiUsage(');
  assert.ok(authIndex > 0 && markIndex > 0);
  assert.ok(authIndex < markIndex, 'usage is charged before the learner is identified');
  assert.match(route, /status: 401/);
});

test('the route refuses a week that is not open yet', () => {
  assert.match(route, /readStoredCurrentWeek/);
  assert.doesNotMatch(route, /refresh_current_week/);
  assert.match(route, /This week is not open yet\./);
});

test('all three boxes are routed to a table "Delete my data" already clears', () => {
  // Reusing the existing attempt tables is what makes the deletion requirement
  // work without a new migration.
  assert.match(route, /'week_grammar_attempts' \| 'week_vocabulary_attempts'/);
  assert.match(route, /kind === 'vocabulary-sentence' \? 'week_vocabulary_attempts' : 'week_grammar_attempts'/);
  const migrations = readFileSync(new URL('../../supabase-b1-b2/migrations/0044_repair_deletion_function.sql', import.meta.url), 'utf8');
  for (const table of ['week_vocabulary_attempts', 'week_grammar_attempts', 'week_input_answers']) {
    assert.ok(migrations.includes(table), `${table} is not covered by the deletion repair`);
  }
});

test('a miss becomes a review card, and the attempt is stored either way', () => {
  assert.match(route, /from\('error_review_cards'\)/);
  assert.match(route, /addedToReview/);
  // The attempt insert happens before the card, so a card failure cannot lose it.
  assert.ok(route.indexOf("from(table).insert") < route.indexOf("from('error_review_cards').insert"));
});

test('AI failures use the shared B1 wording and the usual usage accounting', () => {
  assert.match(route, /providerFailureResponse/);
  assert.match(route, /enforceAiUsage\(client, '\/api\/review\/check-rewrite', 1\)/);
  // The provider's own message must never reach the browser.
  assert.ok(!/error\.message\s*\}\s*\)\s*,\s*\{\s*status:\s*5/.test(route));
});

test('every vocabulary sentence has a model answer to check against', () => {
  for (const week of bank.weeks) {
    for (const sentence of week.yourSentence) {
      assert.ok(sentence.model.trim(), `${sentence.id} cannot be checked`);
    }
  }
});
