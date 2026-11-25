import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearGrammarPositions,
  createGrammarPositionStore,
  grammarPositionItem,
  grammarPositionKey,
  parseGrammarPosition,
} from '../../lib/curriculum/grammar-practice-position.mjs';

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('positions are separated by learner and week, including signed-out visits', () => {
  const keys = [grammarPositionKey(1, null), grammarPositionKey(1, 'one'), grammarPositionKey(2, 'one'), grammarPositionKey(1, 'two')];
  assert.equal(new Set(keys).size, keys.length);
  assert.notEqual(grammarPositionKey(1, null), grammarPositionKey(1, 'guest'));
});

test('invalid or old browser data cannot select an unknown step or item', () => {
  for (const raw of [null, '', '{', 'null', '[]', '42', '{"step":"unknown"}']) {
    assert.equal(parseGrammarPosition(raw), null);
  }
  assert.deepEqual(parseGrammarPosition(JSON.stringify({
    step: 'Fix it',
    items: { Practise: 'W1-C2', 'Fix it': 4, Remember: 'not remembered', extra: 'x' },
    answers: { secret: 'not read' },
  })), { step: 'Fix it', items: { Practise: 'W1-C2' } });
  assert.deepEqual(parseGrammarPosition(JSON.stringify({ step: 'Practise', items: { Practise: 'x'.repeat(101) } })), {
    step: 'Practise', items: {},
  });

  const items = [{ id: 'a' }, { id: 'b' }, { id: 'optional' }];
  const visible = items.slice(0, 2);
  assert.equal(grammarPositionItem(items, visible, { a: false }, 'removed'), 'b');
  assert.equal(grammarPositionItem(items, visible, { a: true, b: true }, undefined), 'a');
  assert.equal(grammarPositionItem(items, visible, {}, 'optional'), 'optional', 'temporarily hidden adaptive item is remembered');
  assert.equal(grammarPositionItem([], [], {}, 'removed'), '');
});

test('store reloads the actual selected position and keeps no answer or mark', () => {
  const storage = new MemoryStorage();
  const key = grammarPositionKey(1, 'one');
  const store = createGrammarPositionStore(key, () => storage);
  assert.equal(store.getServerSnapshot(), null);
  assert.equal(store.getSnapshot(), null);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications += 1; });
  store.update(() => ({ step: 'Practise', items: { Practise: 'W1-C2' } }));
  store.update((previous) => ({ step: 'Fix it', items: { ...previous.items, 'Fix it': 'W1-F2' } }));
  assert.equal(notifications, 2);
  const reload = createGrammarPositionStore(key, () => storage);
  assert.deepEqual(parseGrammarPosition(reload.getSnapshot()), {
    step: 'Fix it', items: { Practise: 'W1-C2', 'Fix it': 'W1-F2' },
  });
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(key))).sort(), ['items', 'step']);
  unsubscribe();
  store.update((previous) => ({ ...previous, step: 'Use it' }));
  assert.equal(notifications, 2);
});

test('blocked storage never blocks in-page navigation', () => {
  const store = createGrammarPositionStore('blocked', () => { throw new Error('storage blocked'); });
  assert.equal(store.getSnapshot(), null);
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });
  store.update(() => ({ step: 'Practise', items: { Practise: 'W1-C3' } }));
  assert.equal(notifications, 1);
  assert.deepEqual(parseGrammarPosition(store.getSnapshot()), { step: 'Practise', items: { Practise: 'W1-C3' } });
  assert.equal(createGrammarPositionStore('blocked', () => { throw new Error('storage blocked'); }).getSnapshot(), null);
});

test('successful data deletion can clear only that learner’s positions', () => {
  const storage = new MemoryStorage();
  const keys = [grammarPositionKey(1, 'one'), grammarPositionKey(2, 'one'), grammarPositionKey(1, 'one-more'), grammarPositionKey(1, null), 'other-app'];
  for (const key of keys) storage.setItem(key, 'present');
  clearGrammarPositions(storage, 'one');
  assert.equal(storage.getItem(keys[0]), null);
  assert.equal(storage.getItem(keys[1]), null);
  for (const key of keys.slice(2)) assert.equal(storage.getItem(key), 'present');
  assert.doesNotThrow(() => clearGrammarPositions({ get length() { throw new Error('blocked'); } }, 'one'));
});
