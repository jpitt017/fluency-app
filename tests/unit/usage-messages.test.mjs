import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyLimitMessage } from '../../lib/b1b2/usage-messages.mjs';

test('daily limit message only advertises to free users when pricing is enabled', () => {
  const text = "You've done a lot of practice today! You can use the AI again tomorrow.";
  for (const tier of ['free', 'pilot', 'pro', 'staff']) {
    assert.equal(dailyLimitMessage(tier, false), text);
    assert.equal(dailyLimitMessage(tier, true).includes('upgrade'), tier === 'free');
  }
});
