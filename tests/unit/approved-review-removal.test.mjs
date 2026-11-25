import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { removeApprovedReviewCards } from '../../scripts/remove-approved-review-cards.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const otherOwner = '22222222-2222-4222-8222-222222222222';
const cardIds = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
const timestamp = '2026-11-25T09:30:44.947338+00:00';
const confirmation = 'the learner approved these cards';
const ownerHash = createHash('sha256').update(owner).digest('hex');
const approval = { ownerHash, cards: cardIds.map((id) => ({ id, updatedAt: timestamp })) };

/** Exercise the actual PostgREST query builder against a fake, filtered store. */
function fixture({ changeBeforeDelete = false } = {}) {
  const rows = [
    ...cardIds.map((id) => ({ id, user_id: owner, updated_at: timestamp, reps: 0, last_review_at: null, mastered: false, suspended: false })),
    { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', user_id: otherOwner, updated_at: timestamp, reps: 0, last_review_at: null, mastered: false, suspended: false },
  ];
  const requests = [];
  let deletionCount = 0;
  const fetch = async (input, init = {}) => {
    const url = new URL(input.toString());
    const method = init.method ?? 'GET';
    const filters = Object.fromEntries(url.searchParams.entries());
    requests.push({ method, filters });
    assert.equal(url.pathname, '/rest/v1/error_review_cards');
    if (method === 'DELETE' && changeBeforeDelete && deletionCount === 1) {
      rows.find((row) => row.id === cardIds[1]).reps = 1;
    }
    const matching = rows.filter((row) => Object.entries(filters).every(([key, condition]) => {
      if (key === 'select') return true;
      if (condition === 'is.null') return row[key] === null;
      return condition.startsWith('eq.') && String(row[key]) === condition.slice(3);
    }));
    if (method === 'DELETE') {
      deletionCount += 1;
      for (const row of matching) rows.splice(rows.indexOf(row), 1);
    }
    const data = matching.map((row) => method === 'DELETE' ? { id: row.id } : { id: row.id, user_id: row.user_id });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createClient('https://example.invalid', 'not-a-real-key', { global: { fetch }, auth: { persistSession: false } });
  return { rows, requests, client };
}

test('removes only the two approved cards through individually guarded API deletes', async () => {
  const { rows, requests, client } = fixture();
  assert.equal(await removeApprovedReviewCards(client, approval, confirmation), 2);
  assert.deepEqual(rows.map((row) => row.id), ['cccccccc-cccc-4ccc-8ccc-cccccccccccc']);
  assert.deepEqual(requests.map((request) => request.method), ['GET', 'GET', 'DELETE', 'DELETE']);
  for (const [index, request] of requests.filter((entry) => entry.method === 'DELETE').entries()) {
    assert.equal(request.filters.id, `eq.${cardIds[index]}`);
    assert.equal(request.filters.user_id, `eq.${owner}`);
    assert.equal(request.filters.updated_at, `eq.${timestamp}`);
    assert.equal(request.filters.reps, 'eq.0');
    assert.equal(request.filters.last_review_at, 'is.null');
    assert.equal(request.filters.mastered, 'eq.false');
    assert.equal(request.filters.suspended, 'eq.false');
  }
});

test('requires explicit consent, a valid fingerprint and distinct bounded IDs', async () => {
  for (const [input, phrase] of [
    [approval, ''],
    [{ ...approval, ownerHash: 'not-a-hash' }, confirmation],
    [{ ...approval, cards: [] }, confirmation],
    [{ ...approval, cards: [approval.cards[0], approval.cards[0]] }, confirmation],
    [{ ...approval, cards: [...approval.cards, approval.cards[0]] }, confirmation],
    [{ ...approval, cards: [{ id: cardIds[0], updatedAt: 'not-a-timestamp' }] }, confirmation],
  ]) {
    const { requests, client } = fixture();
    await assert.rejects(removeApprovedReviewCards(client, input, phrase));
    assert.equal(requests.length, 0);
  }
});

test('a wrong owner, missing card, or previously reviewed card leaves both untouched', async () => {
  for (const kind of ['owner', 'missing', 'reviewed', 'changed']) {
    const { rows, requests, client } = fixture();
    if (kind === 'owner') rows[1].user_id = otherOwner;
    if (kind === 'missing') rows.splice(1, 1);
    if (kind === 'reviewed') rows[1].reps = 1;
    if (kind === 'changed') rows[1].updated_at = '2026-11-25T10:00:00+00:00';
    await assert.rejects(removeApprovedReviewCards(client, approval, confirmation), /no cards were removed/);
    assert.equal(requests.some((request) => request.method === 'DELETE'), false);
    assert.ok(rows.some((row) => row.id === cardIds[0]));
  }
});

test('a card changed during removal is not deleted and the partial outcome is reported', async () => {
  const { rows, requests, client } = fixture({ changeBeforeDelete: true });
  await assert.rejects(removeApprovedReviewCards(client, approval, confirmation), /stopped after 1 card/);
  assert.equal(requests.filter((request) => request.method === 'DELETE').length, 2);
  assert.ok(rows.some((row) => row.id === cardIds[1]));
  assert.ok(rows.some((row) => row.user_id === otherOwner));
});
