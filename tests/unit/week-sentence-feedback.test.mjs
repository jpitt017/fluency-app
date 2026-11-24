import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../lib/b1b2/week-sentence-feedback.ts', import.meta.url), 'utf8');

test('the model is asked for exactly the three parts the UI renders', () => {
  for (const part of ['good', 'corrected', 'tip']) {
    assert.ok(source.includes(`"${part}"`), `prompt does not ask for ${part}`);
  }
});

test('the prompt says to accept any correct answer that uses the target', () => {
  assert.match(source, /Accept any correct answer that uses the target form/);
  assert.match(source, /there is no single right sentence|There is no single right sentence/i);
});

test('the wording is pinned to B1 and to British English', () => {
  assert.match(source, /B1 English teacher/);
  assert.match(source, /British English/);
  // The instruction must cap the length, or the model writes paragraphs.
  assert.match(source, /No more than 12 words per part/);
});

test('learner text is wrapped, never interpolated as instructions', () => {
  assert.match(source, /wrapLearnerSubmission/);
  assert.match(source, /UNTRUSTED_DATA_SYSTEM_RULE/);
});

test('all three boxes are distinguished for the model', () => {
  for (const kind of ['grammar-rewrite', 'grammar-use-it', 'vocabulary-sentence']) {
    assert.ok(source.includes(kind), `missing context kind ${kind}`);
  }
});

test('a missing key or a bad shape returns null rather than throwing', () => {
  assert.match(source, /if \(!apiKey\) return null;/);
  assert.match(source, /if \(!parsed\.success\) return null;/);
});
