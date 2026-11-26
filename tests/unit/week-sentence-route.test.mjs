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

test('the route requires an authenticated learner before invoking either checker', () => {
  // The personal checker is declared above POST, so check execution order in
  // POST rather than comparing source positions across function declarations.
  const post = route.slice(route.indexOf('export async function POST'));
  const authIndex = post.indexOf('await client.auth.getUser()');
  const personalIndex = post.indexOf('return checkPersonalSentence(');
  const rewriteIndex = post.indexOf('await enforceAiUsage(');
  assert.ok(authIndex > 0 && personalIndex > authIndex && rewriteIndex > authIndex);
  assert.match(post, /status: 401/);
});

test('the route refuses a week that is not open yet', () => {
  assert.match(route, /readStoredCurrentWeek/);
  assert.doesNotMatch(route, /refresh_current_week/);
  assert.match(route, /This week is not open yet\./);
});

test('all three boxes and both personal versions are covered by Delete my data', () => {
  assert.match(route, /'week_grammar_attempts' \| 'week_vocabulary_attempts'/);
  assert.match(route, /kind === 'vocabulary-sentence' \? 'week_vocabulary_attempts' : 'week_grammar_attempts'/);
  const repair = readFileSync(new URL('../../supabase-b1-b2/migrations/0044_repair_deletion_function.sql', import.meta.url), 'utf8');
  for (const table of ['week_vocabulary_attempts', 'week_grammar_attempts', 'week_input_answers']) {
    assert.ok(repair.includes(table), `${table} is not covered by the deletion repair`);
  }
  const migration = readFileSync(new URL('../../supabase-b1-b2/migrations/0059_week_sentence_writing_support.sql', import.meta.url), 'utf8');
  assert.match(migration, /delete from public\.week_sentence_practice where user_id = \$1/);
  assert.match(migration, /first_answer/);
  assert.match(migration, /second_answer/);
});

test('a miss becomes a review card, and the attempt is stored either way', () => {
  assert.match(route, /from\('error_review_cards'\)/);
  assert.match(route, /addedToReview/);
  // Both paths save their attempt before creating a card. The personal path
  // saves the checked version and attempt atomically in a service-only RPC.
  const personal = route.slice(route.indexOf('async function checkPersonalSentence'), route.indexOf('export async function POST'));
  const rewrite = route.slice(route.indexOf('export async function POST'));
  const personalSave = personal.indexOf("rpc('finish_week_sentence_check'");
  const rewriteSave = rewrite.indexOf('from(table).insert');
  assert.ok(personalSave >= 0 && personalSave < personal.indexOf("from('error_review_cards').insert"));
  assert.ok(rewriteSave >= 0 && rewriteSave < rewrite.indexOf("from('error_review_cards').insert"));
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
