import test from 'node:test';
import assert from 'node:assert/strict';
import { countWords, fetchWithTimeout, writingTaskStatus } from '../../lib/b1b2/text-utils.mjs';

/**
 * `writingTaskStatus` is the writing *lab's* wording and is asserted verbatim
 * below; the placement page uses `writingWordCounter`/`writingHint` instead
 * (`tests/unit/placement-questions.test.mjs`). */

test('countWords ignores whitespace and keeps contractions intact', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   '), 0);
  assert.equal(countWords(null), 0);
  assert.equal(countWords(undefined), 0);
  assert.equal(countWords('one'), 1);
  assert.equal(countWords("I'm learning English"), 3);
  assert.equal(countWords('line one\nline two\t\tline three'), 6);
  assert.equal(countWords('  padded   answer   with   spaces  '), 4);
});

test('writingTaskStatus reports progress and the minimum for evaluation', () => {
  const empty = writingTaskStatus('');
  assert.equal(empty.words, 0);
  assert.equal(empty.meetsMinimum, false);
  assert.equal(empty.message, '0 words · aim for 15–100 words');

  const tooShort = writingTaskStatus('I want to reach B2.', 15, 60);
  assert.deepEqual([tooShort.words, tooShort.meetsMinimum, tooShort.meetsTarget], [5, false, false]);
  assert.equal(tooShort.message, '5 words · aim for 15–100 words');

  const single = writingTaskStatus('Hello', 1, 60);
  assert.equal(single.message, '1 word · enough to evaluate');
  assert.equal(single.meetsMinimum, true);

  const minimum = writingTaskStatus(Array.from({ length: 15 }, () => 'word').join(' '), 15, 60);
  assert.deepEqual([minimum.words, minimum.meetsMinimum, minimum.meetsTarget], [15, true, false]);
  assert.equal(minimum.message, '15 words · enough to evaluate');

  const target = writingTaskStatus(Array.from({ length: 87 }, () => 'word').join(' '), 15, 60);
  assert.equal(target.message, '87 words · enough to evaluate');
  assert.equal(target.meetsTarget, true);
});

test('fetchWithTimeout aborts with a learner-friendly error', async () => {
  const originalFetch = globalThis.fetch;
  try {
    // A fetch that never resolves still has to give up at the timeout.
    globalThis.fetch = (input, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
    await assert.rejects(
      fetchWithTimeout('https://example.test/slow', {}, 25, 'Scoring is taking longer than usual.'),
      /Scoring is taking longer than usual\./,
    );

    // Real failures keep their own message so callers can report them.
    globalThis.fetch = async () => { throw new Error('network down'); };
    await assert.rejects(fetchWithTimeout('https://example.test/x', {}, 100), /network down/);

    // Success passes the response straight through.
    globalThis.fetch = async () => ({ ok: true, status: 200 });
    const response = await fetchWithTimeout('https://example.test/ok', {}, 100);
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
