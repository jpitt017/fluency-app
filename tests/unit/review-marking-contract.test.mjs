import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The review card and the rewrite route must agree on one field name.
 *
 * The card decides "was this answer marked?" from the response, and what it
 * decides there is what sets the FSRS rating. It asked `'correct' in result`
 * while the route sends `fixed`, so the branch could never be taken: every
 * marked answer fell through to the four self-ratings and requirement 1
 * (marking sets the rating) did nothing at all.
 *
 * `tsc` accepted it because the response type declared `correct?: boolean` — an
 * invented optional field is exactly what makes a dead branch type-check. So the
 * assertion here is on the contract, not on behaviour:
 *
 *   1. the route's success payload sends `fixed`;
 *   2. the card reads `fixed`, and never `correct`, from that payload.
 */
const route = readFileSync(new URL('../../src/app/api/review/check-rewrite/route.ts', import.meta.url), 'utf8');
const studio = readFileSync(new URL('../../components/b1b2/ErrorReviewStudio.tsx', import.meta.url), 'utf8');

test('the rewrite route reports the mark as "fixed"', () => {
  assert.match(route, /\bfixed,/, 'the success payload no longer sends `fixed`');
});

test('the review card reads the mark from "fixed"', () => {
  assert.match(studio, /checkResult\?\.fixed/, 'the card does not read `fixed`');
  assert.match(studio, /\bBoolean\(checkResult\?\.fixed\)/, 'the grade does not come from `fixed`');
});

test('the card never keys the marking branch off a field the route does not send', () => {
  assert.doesNotMatch(studio, /checkResult\?\.correct/, 'reads `correct`, which the route never sends');
  assert.doesNotMatch(studio, /'correct' in checkResult/, "branches on 'correct', which is never present");
  // An optional invented field is what hid this from tsc, so it must not exist.
  assert.doesNotMatch(studio, /^\s*correct\?: boolean;/m, 'the response type redeclares `correct`');
});
