import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
function setup({ signedIn = true, rows = [], error = null } = {}) {
  const filters = [];
  let queries = 0;
  const query = {
    select() { return this; },
    eq(key, value) { filters.push([key, value]); return this; },
    then(resolve, reject) {
      const matched = rows.filter((row) => filters.every(([key, value]) => row[key] === value));
      return Promise.resolve({ data: matched, error }).then(resolve, reject);
    },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'owner' } : null } }) },
    from(table) { assert.equal(table, 'week_sentence_practice'); queries += 1; return query; },
  };
  const js = ts.transpileModule(read('lib/curriculum/week-sentence-practice.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(js, { exports, console: { error() {} }, require(name) {
    if (name === 'server-only') return {};
    if (name === '@/utils/supabase/server') return { createServerSupabase: async () => client };
    throw new Error(name);
  } });
  return { ...exports, filters, get queries() { return queries; } };
}
const row = (user, week, id, first, second = null, draft = null) => ({
  user_id: user, week_number: week, item_id: id, kind: id.startsWith('W') ? 'grammar-use-it' : 'vocabulary-sentence',
  first_answer: first?.answer ?? null, first_feedback: first?.feedback ?? null, first_on_target: first?.onTarget ?? null,
  second_answer: second?.answer ?? null, second_feedback: second?.feedback ?? null, second_on_target: second?.onTarget ?? null,
  draft_answer: draft,
});
const version = (answer, corrected, onTarget = true) => ({ answer, onTarget, feedback: { target: 'Good.', otherPoints: [], corrected } });

test('loading restores both versions and a failed draft, scoped to the signed-in learner and week', async () => {
  const first = version('First answer.', 'First correction.', false);
  const second = version('Second answer.', 'Second correction.');
  const api = setup({ rows: [
    row('owner', 1, 'W1-U1', first, second, 'unfinished draft'),
    row('owner', 2, 'W2-U1', version('Different week.', 'Week two.')),
    row('other', 1, 'W1-U2', version('Private.', 'Private.')),
  ] });
  const result = await api.loadWeekSentencePractice(1);
  assert.deepEqual(Object.keys(result), ['W1-U1']);
  assert.equal(result['W1-U1'].first.answer, 'First answer.');
  assert.equal(result['W1-U1'].second.feedback.corrected, 'Second correction.');
  assert.equal(result['W1-U1'].draft, 'unfinished draft');
  assert.deepEqual(api.filters, [['user_id', 'owner'], ['week_number', 1]]);
});

test('guests, invalid weeks and failed reads reveal no saved work', async () => {
  const guest = setup({ signedIn: false, rows: [row('owner', 1, 'W1-U1', version('A.', 'A.'))] });
  assert.deepEqual(Object.keys(await guest.loadWeekSentencePractice(1)), []);
  assert.equal(guest.queries, 0);
  const invalid = setup();
  assert.deepEqual(Object.keys(await invalid.loadWeekSentencePractice(0)), []);
  assert.deepEqual(Object.keys(await invalid.loadWeekSentencePractice(5)), []);
  assert.equal(invalid.queries, 0);
  const unavailable = setup({ error: { message: 'unavailable' } });
  assert.deepEqual(Object.keys(await unavailable.loadWeekSentencePractice(1)), []);
});

test('writing ideas are only grammar from the selected week and use the newest usable correction', () => {
  const api = setup();
  const practice = {
    'W1-U1': { first: version('First.', 'First correction.', false), second: version('Second.', 'Second correction.'), draft: null },
    'W1-U2': { first: version('First two.', 'First useful correction.', false), second: version('Still wrong.', 'Still wrong.', false), draft: null },
    'V1-S1': { first: version('Vocabulary.', 'Vocabulary correction.'), second: null, draft: null },
    'W2-U1': { first: version('Other week.', 'Other week correction.'), second: null, draft: null },
  };
  assert.deepEqual(Array.from(api.grammarWritingIdeas(practice, 1)), ['Second correction.', 'First useful correction.']);
  assert.deepEqual(Array.from(api.grammarWritingIdeas(practice, 2)), ['Other week correction.']);
  assert.deepEqual(Array.from(api.grammarWritingIdeas({ 'W1-U1': { first: version('Rejected.', 'Rejected.', false), second: null, draft: null } }, 1)), []);
});

test('weekly writing shows ideas only for an explicit signed-in weekly task, not free practice', () => {
  const labs = read('src/app/labs/page.tsx');
  const ui = read('components/labs/WritingLab.tsx');
  assert.match(labs, /const selectedWeek = weekParam \? pronunciationWeek : null/);
  assert.match(labs, /selectedWeek && viewer\.signedIn/);
  assert.match(labs, /grammarWritingIdeas\(await loadWeekSentencePractice\(weekNumber\), weekNumber\)/);
  assert.match(labs, /grammarIdeas=\{grammarIdeas\}/);
  assert.match(ui, /Ideas from your grammar practice/);
});
