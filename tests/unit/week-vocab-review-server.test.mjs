import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../lib/b1b2/week-vocab-review.ts', import.meta.url), 'utf8');

/** Exercise the real weekly Review helper without a database or live SQL. */
function setup({ cards = [], items = null, failRpc = false } = {}) {
  const tables = {
    vocab_decks: [{ id: 'weekly', slug: 'weeks-01-04' }, { id: 'module', slug: 'module-1' }],
    // Intentionally in the opposite order from the deck priority.
    vocab_items: items ?? [
      { id: 'module-word', deck_id: 'module', term: 'challenge' },
      { id: 'weekly-word', deck_id: 'weekly', term: 'challenge' },
    ],
    vocab_cards: cards.map((card) => ({ ...card })),
  };
  let rpcCount = 0;
  let scheduleCount = 0;
  const admin = {
    from(table) {
      const filters = [];
      let sorting = null;
      let pendingUpdate = null;
      const find = () => {
        let rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
        if (sorting) rows = [...rows].sort((a, b) => String(b[sorting]).localeCompare(String(a[sorting])));
        return rows;
      };
      const builder = {
        select() { return this; },
        eq(key, value) { filters.push((row) => row[key] === value); return this; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return this; },
        // Deliberately return a broad set to prove the exact in-code check.
        ilike() { return this; },
        order(key) { sorting = key; return this; },
        async maybeSingle() { return { data: find()[0] ?? null, error: null }; },
        then(resolve, reject) {
          if (pendingUpdate) for (const row of find()) Object.assign(row, pendingUpdate);
          return Promise.resolve({ data: find(), error: null }).then(resolve, reject);
        },
        async upsert(row) {
          const found = tables[table].find((entry) => entry.user_id === row.user_id
            && entry.vocab_item_id === row.vocab_item_id && entry.card_kind === row.card_kind);
          if (!found) tables[table].push({ id: `card-${row.vocab_item_id}`, suspended: false, reps: 0, ...row });
          return { error: null };
        },
        update(values) { pendingUpdate = values; return this; },
      };
      return builder;
    },
    async rpc() {
      rpcCount += 1;
      return failRpc ? { data: null, error: { message: 'not signed in' } } : { data: { ok: true }, error: null };
    },
  };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === 'server-only') return {};
      if (name === './fsrs') return { scheduleFsrsReview: () => {
        scheduleCount += 1;
        return { due_at: '2030-01-01T00:00:00Z', interval_days: 0, stability: 1, difficulty: 5, fsrs_state: 1, learning_steps: 1, reps: 2, lapses: 1 };
      } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    console: { error() {} },
  });
  return { tables, admin, update: exports.updateReviewFromWeeklyPractice, counts: () => ({ rpcCount, scheduleCount }) };
}

const at = new Date('2026-01-01T00:00:00Z');

test('Finish creates a missing exact word card, without grading it twice', async () => {
  const fixture = setup();
  for (let i = 0; i < 2; i += 1) {
    const result = await fixture.update(fixture.admin, 'learner', 'challenge', false, at, { ensureOnly: true });
    assert.equal(result.updated, true);
  }
  assert.equal(fixture.tables.vocab_cards.length, 1);
  assert.equal(fixture.tables.vocab_cards[0].vocab_item_id, 'weekly-word');
  assert.equal(fixture.tables.vocab_cards[0].due_at, at.toISOString());
  assert.deepEqual(fixture.counts(), { rpcCount: 0, scheduleCount: 0 });
});

test('an existing active card is reused across decks, without altering its schedule', async () => {
  const card = { id: 'existing', user_id: 'learner', vocab_item_id: 'module-word', card_kind: 'definition',
    due_at: '2030-02-01T00:00:00Z', suspended: false, reps: 7 };
  const fixture = setup({ cards: [card] });
  await fixture.update(fixture.admin, 'learner', 'challenge', false, at, { ensureOnly: true });
  assert.deepEqual(fixture.tables.vocab_cards, [card]);
  assert.deepEqual(fixture.counts(), { rpcCount: 0, scheduleCount: 0 });
});

test('suspended cards are not claimed as available in Review', async () => {
  const card = { id: 'suspended', user_id: 'learner', vocab_item_id: 'module-word', card_kind: 'definition',
    due_at: '2030-02-01T00:00:00Z', suspended: true, reps: 7 };
  const fixture = setup({ cards: [card] });
  const result = await fixture.update(fixture.admin, 'learner', 'challenge', false, at, { ensureOnly: true });
  assert.equal(result.updated, false);
  assert.deepEqual(fixture.tables.vocab_cards, [card]);
});

test('marking still grades the existing card, while an inexact database match is rejected', async () => {
  const fixture = setup();
  const result = await fixture.update(fixture.admin, 'learner', 'challenge', false, at);
  assert.equal(result.updated, true);
  assert.deepEqual(fixture.counts(), { rpcCount: 1, scheduleCount: 1 });
  const inexact = setup({ items: [{ id: 'other', deck_id: 'weekly', term: 'look forward' }] });
  const notFound = await inexact.update(inexact.admin, 'learner', 'look_forward', false, at, { ensureOnly: true });
  assert.equal(notFound.updated, false);
  assert.equal(inexact.tables.vocab_cards.length, 0);
});
