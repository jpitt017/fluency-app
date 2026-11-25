/**
 * Browser-only navigation memory for weekly grammar practice. This stores no
 * answers or marks: those continue to come from the server. Keys are separated
 * by learner and week so one person's position never selects another's page.
 *
 * The external store keeps a page usable when storage is blocked and exposes a
 * stable string snapshot for React's useSyncExternalStore. The server snapshot
 * is always null, so the first client render matches the server-rendered page.
 */

/** @typedef {'See it' | 'Practise' | 'Fix it' | 'Use it' | 'Remember'} GrammarStep */
/** @typedef {'Practise' | 'Fix it'} RememberedItemStep */
/** @typedef {{ step: GrammarStep, items: Partial<Record<RememberedItemStep, string>> }} GrammarPosition */

const STEPS = new Set(['See it', 'Practise', 'Fix it', 'Use it', 'Remember']);
const ITEM_STEPS = ['Practise', 'Fix it'];
const PREFIX = 'fluency:grammar-position:v1:';

/** @param {string | null | undefined} userId */
export function grammarPositionPrefix(userId) {
  return `${PREFIX}${userId ? `user:${encodeURIComponent(userId)}` : 'guest'}:`;
}

/** @param {number} week @param {string | null | undefined} userId */
export function grammarPositionKey(week, userId) {
  return `${grammarPositionPrefix(userId)}week:${week}`;
}

/** @param {string | null} raw @returns {GrammarPosition | null} */
export function parseGrammarPosition(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || typeof value.step !== 'string' || !STEPS.has(value.step)) return null;
    /** @type {GrammarPosition['items']} */
    const items = {};
    if (value.items && typeof value.items === 'object' && !Array.isArray(value.items)) {
      for (const title of ITEM_STEPS) {
        const id = value.items[title];
        if (typeof id === 'string' && id.length > 0 && id.length <= 100) {
          items[/** @type {RememberedItemStep} */ (title)] = id;
        }
      }
    }
    return { step: /** @type {GrammarStep} */ (value.step), items };
  } catch {
    return null;
  }
}

/**
 * Keep a known hidden adaptive item selected so it can reappear if the branch
 * opens again. The pager shows its first visible item while it is hidden. If an
 * item was removed from the curriculum entirely, fall back to the first gap.
 *
 * @param {{ id: string }[]} items
 * @param {{ id: string }[]} visible
 * @param {Record<string, unknown>} initiallyAnswered
 * @param {string | undefined} remembered
 */
export function grammarPositionItem(items, visible, initiallyAnswered, remembered) {
  if (remembered && items.some((item) => item.id === remembered)) return remembered;
  return visible.find((item) => !Object.hasOwn(initiallyAnswered, item.id))?.id ?? visible[0]?.id ?? '';
}

/**
 * @param {string} key
 * @param {() => Storage} [getStorage]
 */
export function createGrammarPositionStore(key, getStorage = () => window.localStorage) {
  /** @type {string | null | undefined} */
  let snapshot;
  /** @type {Set<() => void>} */
  const listeners = new Set();

  function getSnapshot() {
    if (snapshot === undefined) {
      try { snapshot = getStorage().getItem(key); } catch { snapshot = null; }
    }
    return snapshot;
  }

  return {
    getSnapshot,
    getServerSnapshot: () => null,
    /** @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** @param {(previous: GrammarPosition | null) => GrammarPosition} update */
    update(update) {
      const next = JSON.stringify(update(parseGrammarPosition(getSnapshot())));
      if (next === snapshot) return;
      snapshot = next;
      try { getStorage().setItem(key, next); } catch {
        // Private mode or disabled storage: navigation still works in this view.
      }
      for (const listener of listeners) listener();
    },
  };
}

/** Clear this learner's locally remembered positions after data deletion. */
/** @param {Storage} storage @param {string | null | undefined} userId */
export function clearGrammarPositions(storage, userId) {
  if (!userId) return;
  try {
    const prefix = grammarPositionPrefix(userId);
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Browser storage may be disabled; server-side deletion still succeeded.
  }
}
