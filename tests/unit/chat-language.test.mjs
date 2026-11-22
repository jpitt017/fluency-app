import test from 'node:test';
import assert from 'node:assert/strict';
import { languageRules, safeChatReply, sentencesWithinLimit } from '../../lib/b1b2/chat-language.mjs';

test('Week 1 offline reply has no sentence over 20 words', () => {
  const tooLong = 'This is a deliberately long sentence with far too many words for a learner who has only just started practising English with the partner today.';
  assert.equal(sentencesWithinLimit(tooLong), false);
  const reply = safeChatReply(tooLong, 1);
  assert.ok(sentencesWithinLimit(reply));
  assert.equal(safeChatReply('That sounds difficult. What helped you?', 1), 'That sounds difficult. What helped you?');
  assert.equal(safeChatReply(tooLong, 9), tooLong);
});

test('chat instructions match week and use British English', () => {
  for (const week of [1, 8, 9, 16, 17, 32]) {
    assert.match(languageRules(week), /British English only/);
    assert.match(languageRules(week), /more simply/);
  }
  assert.match(languageRules(8), /at most one new B2 phrase/);
  assert.match(languageRules(9), /B1\+/);
  assert.match(languageRules(16), /B1\+/);
  assert.match(languageRules(17), /B2 learners/);
});
