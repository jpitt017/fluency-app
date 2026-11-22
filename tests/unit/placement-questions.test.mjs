import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  countWords,
  writingHint,
  writingTaskStatus,
  writingWordCounter,
} from '../../lib/b1b2/text-utils.mjs';

/**
 * The placement loader's query shape, plus the writing-step helpers the page uses.
 *
 * Correction, recorded because it matters: the base table `placement_questions`
 * holds 48 active rows (24 v2 + 24 legacy, both numbered sort_order 1–24), but the
 * `placement_questions_safe` *view* already filters `active AND version = 'v2'`
 * and returns 24. The page was therefore never rendering duplicate options, and
 * the extra `.eq('version', …)` plus the dedupe below are defence in depth, not a
 * bug fix. Only 24 questions ever reached the browser; the production check
 * confirms it.
 */

const data = readFileSync(new URL('../../lib/b1b2/data.ts', import.meta.url), 'utf8');
const loader = data.slice(
  data.indexOf('export async function loadPlacementQuestions'),
  data.indexOf('export async function loadPlacementTexts'),
);

test('the placement loader asks for the v2 questions only', () => {
  assert.match(data, /export const PLACEMENT_VERSION = 'v2'/);
  assert.match(loader, /\.eq\('version', PLACEMENT_VERSION\)/, 'the loader must filter by version');
  assert.match(loader, /\.order\('sort_order'/, 'and keep a deterministic order');
  assert.doesNotMatch(loader, /from\('placement_questions'\)/, 'the answer key table must not be read here');
});

test('the loader dedupes by sort_order, so a question cannot appear twice', () => {
  assert.match(loader, /const seen = new Set<number>\(\)/);
  assert.match(loader, /if \(seen\.has\(order\)\) return false;/);
});

test('the writing counter reads the way a learner reads it', () => {
  assert.equal(writingWordCounter('').label, '0 / 60-100 words');
  assert.equal(writingWordCounter('I am learning English').label, '4 / 60-100 words');
  assert.equal(writingWordCounter('  spaced   out  ').words, 2);
  assert.equal(writingWordCounter('word '.repeat(120)).overMaximum, true);
});

test('the counter and the disabled button agree on the 15-word minimum', () => {
  const fourteen = writingWordCounter('word '.repeat(14));
  assert.equal(fourteen.meetsMinimum, false);
  assert.equal(writingHint(fourteen.words), 'Write at least 15 words, or skip');

  const fifteen = writingWordCounter('word '.repeat(15));
  assert.equal(fifteen.meetsMinimum, true);
  assert.equal(writingHint(fifteen.words), null);

  assert.equal(writingHint(0), 'Write at least 15 words, or skip');
});

test('countWords keeps contractions and hyphenated words together', () => {
  assert.equal(countWords("I don't know"), 3);
  assert.equal(countWords('a 60-100 word range'), 4);
  assert.equal(countWords(null), 0);
  assert.equal(countWords(undefined), 0);
});

test('writingTaskStatus still reports the minimum and the target', () => {
  assert.equal(writingTaskStatus('one two three', 15, 60).meetsMinimum, false);
  assert.equal(writingTaskStatus('word '.repeat(60), 15, 60).meetsTarget, true);
});
