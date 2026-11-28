import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { finishAnsweredPracticeSummaries } from '../../lib/curriculum/week-practice-auto-finish.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function fixture({ completions = [], attempts = {}, failedSkills = [] } = {}) {
  const completed = new Set(completions);
  const calls = [];
  const client = {
    from(table) {
      const filters = {};
      return {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        then(resolve, reject) {
          const rows = table === 'week_skill_completions'
            ? [...completed].map((skill) => ({ skill }))
            : [];
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
    },
  };
  const plans = {
    grammar: { items: [
      { id: 'g1', counted: true }, { id: 'g2', counted: true }, { id: 'optional', counted: false },
    ] },
    vocabulary: { items: [
      { id: 'v1', counted: true }, { id: 'v2', counted: true },
    ] },
  };
  const readAttempts = async (_client, table) => ({ rows: attempts[table] ?? [], error: null });
  const finishPractice = async ({ skill, week }) => {
    calls.push({ skill, week });
    if (failedSkills.includes(skill)) return { ok: false };
    completed.add(skill);
    return { ok: true };
  };
  return { client, plans, readAttempts, finishPractice, calls, completed };
}

test('auto-finish creates a snapshot only when all counted items are checked', async () => {
  const state = fixture({
    attempts: {
      week_grammar_attempts: [
        { item_id: 'g1', correct: true }, { item_id: 'g2', correct: false },
        { item_id: 'optional', correct: false },
      ],
      week_vocabulary_attempts: [
        { item_id: 'v1', correct: true }, { item_id: 'v2', correct: true },
      ],
    },
  });
  const finished = await finishAnsweredPracticeSummaries({
    week: 1, userId: 'learner', client: state.client, admin: {}, plans: state.plans,
    readAttempts: state.readAttempts, finishPractice: state.finishPractice,
  });
  assert.deepEqual(finished, ['grammar', 'vocabulary']);
  assert.deepEqual(state.calls, [{ skill: 'grammar', week: 1 }, { skill: 'vocabulary', week: 1 }]);
  const laterVisit = await finishAnsweredPracticeSummaries({
    week: 1, userId: 'learner', client: state.client, admin: {}, plans: state.plans,
    readAttempts: state.readAttempts, finishPractice: state.finishPractice,
  });
  assert.deepEqual(laterVisit, []);
  assert.equal(state.calls.length, 2, 'existing summaries are not generated again on later visits');
});

test('partial answers and existing Finish snapshots do not auto-finish again', async () => {
  const state = fixture({
    completions: ['vocabulary'],
    attempts: {
      week_grammar_attempts: [{ item_id: 'g1', correct: true }],
      week_vocabulary_attempts: [{ item_id: 'v1', correct: false }, { item_id: 'v2', correct: true }],
    },
  });
  const finished = await finishAnsweredPracticeSummaries({
    week: 1, userId: 'learner', client: state.client, admin: {}, plans: state.plans,
    readAttempts: state.readAttempts, finishPractice: state.finishPractice,
  });
  assert.deepEqual(finished, []);
  assert.deepEqual(state.calls, []);
});

test('a failed summary write is left eligible for a later visit to retry', async () => {
  const state = fixture({
    failedSkills: ['grammar'],
    attempts: { week_grammar_attempts: [{ item_id: 'g1', correct: true }, { item_id: 'g2', correct: false }] },
  });
  const finished = await finishAnsweredPracticeSummaries({
    week: 1, userId: 'learner', client: state.client, admin: {}, plans: state.plans,
    readAttempts: state.readAttempts, finishPractice: state.finishPractice,
  });
  assert.deepEqual(finished, []);
  assert.deepEqual(state.calls, [{ skill: 'grammar', week: 1 }]);
  assert.equal(state.completed.has('grammar'), false);
});

test('dashboard and week page both run the server-side Review recovery before rendering', () => {
  const dashboard = read('src/app/dashboard/page.tsx');
  const week = read('src/app/week/[n]/page.tsx');
  for (const source of [dashboard, week]) {
    assert.match(source, /ensureWeeklyPracticeSummary\(/);
  }
});
