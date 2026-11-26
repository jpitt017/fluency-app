import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as rules from '../../lib/curriculum/week-practice.mjs';
import * as grammarMarking from '../../lib/curriculum/grammar-marking.mjs';
import * as learnerGrammarMarking from '../../lib/curriculum/learner-grammar-marking.mjs';
import * as vocabularyProjection from '../../lib/curriculum/vocabulary-exercise-projection.mjs';
import * as vocabularyLinks from '../../lib/curriculum/vocabulary-review-link.mjs';
import * as review from '../../lib/curriculum/week-practice-review.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const vocabularyBank = JSON.parse(read('supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json'));
const plain = (value) => JSON.parse(JSON.stringify(value));

/** Execute the actual server modules, with an in-memory Supabase, never live SQL. */
function load(path, modules, logs) {
  const compiled = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
    console: { error: (...args) => logs.push(args.map(String).join(' ')) },
  });
  return exports;
}

function setup({ failReview = false, failCard = false, failCompletion = false, failRead = false, currentWeek = 1 } = {}) {
  const tables = { week_grammar_attempts: [], week_vocabulary_attempts: [], week_skill_completions: [], error_review_cards: [] };
  const logs = [];
  const reviewUpdates = [];
  let sequence = 0;
  function addAttempt(table, item_id, answer, correct, user_id = 'learner', week_number = 1) {
    tables[table].push({
      id: String(sequence).padStart(5, '0'), user_id, week_number, item_id, answer, correct,
      created_at: new Date(1_700_000_000_000 + sequence++).toISOString(),
    });
  }

  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'learner' } } }) },
    rpc: async () => ({ data: currentWeek, error: null }),
    from(table) {
      if (!(table in tables)) throw new Error(`Unexpected table ${table}`);
      const filters = {};
      const builder = {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        order() { return this; },
        range(start, end) {
          if (failRead) return Promise.resolve({ data: null, error: { message: 'private read failure' } });
          const rows = tables[table].filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
          return Promise.resolve({ data: rows.slice(start, end + 1), error: null });
        },
        then(resolve, reject) {
          const rows = tables[table].filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
        async insert(row) {
          if (failCard) return { error: { code: 'XX999', message: 'private card failure' } };
          const duplicate = tables[table].some((existing) => existing.user_id === row.user_id
            && existing.category === row.category && existing.normalized_key === row.normalized_key);
          if (duplicate) return { error: { code: '23505', message: 'duplicate' } };
          tables[table].push(row);
          return { error: null };
        },
        async upsert(row) {
          if (failCompletion) return { error: { message: 'private completion failure' } };
          const index = tables[table].findIndex((existing) => existing.user_id === row.user_id
            && existing.week_number === row.week_number && existing.skill === row.skill);
          if (index < 0) tables[table].push(row);
          else tables[table][index] = row;
          return { error: null };
        },
      };
      return builder;
    },
  };

  const grammar = load('lib/curriculum/learner-grammar.ts', {
    'server-only': {}, '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json': details,
    './grammar-marking.mjs': grammarMarking,
  }, logs);
  const vocabulary = load('lib/curriculum/learner-vocabulary-exercises.ts', {
    'server-only': {}, '../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json': vocabularyBank,
    './vocabulary-exercise-projection.mjs': vocabularyProjection,
  }, logs);
  const plan = load('lib/curriculum/week-practice-plan.ts', {
    'server-only': {}, '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json': details,
    '../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json': vocabularyBank,
    './learner-grammar': grammar, './learner-vocabulary-exercises': vocabulary,
    './vocabulary-review-link.mjs': vocabularyLinks, './week-practice.mjs': rules,
  }, logs);
  const attempts = load('lib/curriculum/week-practice-attempts.ts', { 'server-only': {} }, logs);
  const savedMark = load('lib/curriculum/week-grammar-saved-mark.ts', {
    'server-only': {}, '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json': details,
    './grammar-marking.mjs': grammarMarking, './learner-grammar-marking.mjs': learnerGrammarMarking,
  }, logs);
  const finish = load('lib/curriculum/week-practice-finish.ts', {
    'server-only': {}, './week-practice-plan': plan, './week-practice-attempts': attempts,
    './stored-current-week': { readStoredCurrentWeek: async () => currentWeek },
    './week-grammar-saved-mark': savedMark,
    './week-practice-review.mjs': review, './week-practice.mjs': rules,
    '@/lib/b1b2/week-vocab-review': { updateReviewFromWeeklyPractice: async (_db, userId, term, correct, _now, options) => {
      reviewUpdates.push({ userId, term, correct, ensureOnly: options?.ensureOnly });
      return { updated: !failReview };
    } },
  }, logs);
  const progress = load('lib/curriculum/week-practice-progress.ts', {
    'server-only': {}, '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json': details,
    '@/utils/supabase/server': { createServerSupabase: async () => db },
    './learner-grammar': grammar, './learner-vocabulary-exercises': vocabulary,
    './learner-grammar-reasons.mjs': { learnerGrammarReason: (item) => item.reason ?? null },
    './week-practice-plan': plan, './week-practice-attempts': attempts, './week-grammar-saved-mark': savedMark,
    './week-practice.mjs': rules,
  }, logs);
  const route = load('src/app/api/week/practice/finish/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/utils/supabase/server': { createServerSupabase: async () => db },
    '@/utils/supabase/admin': { createAdminSupabase: () => db },
    '@/lib/curriculum/week-practice-finish': finish,
  }, logs);
  return { tables, addAttempt, reviewUpdates, logs, plan, progress, finish: route.POST };
}
const request = (skill, extra = {}) => ({ json: async () => ({ week: 1, skill, ...extra }) });

test('Finish fails closed when stored progress is unavailable or the week is locked', async () => {
  for (const skill of ['grammar', 'vocabulary']) {
    for (const { currentWeek, week, status, error } of [
      { currentWeek: null, week: 1, status: 503, error: 'Could not check your progress.' },
      { currentWeek: 1, week: 2, status: 403, error: 'This week is not open yet.' },
    ]) {
      const fixture = setup({ currentWeek });
      const response = await fixture.finish(request(skill, { week }));
      assert.equal(response.status, status, `${skill}, week ${week}`);
      assert.equal(response.body.error, error);
      assert.equal(fixture.tables.week_skill_completions.length, 0);
      assert.equal(fixture.tables.error_review_cards.length, 0);
      assert.equal(fixture.reviewUpdates.length, 0);
    }
  }
});

test('Week 2 sentence repair and Week 3 word order produce clear, answerable Review cards', async () => {
  const fixture = setup({ currentWeek: 3 });
  fixture.addAttempt('week_grammar_attempts', 'W2-F2', 'I will visit my parents.', false, 'learner', 2);
  fixture.addAttempt('week_grammar_attempts', 'W3-L1', 'What time you usually do get home?', false, 'learner', 3);

  assert.equal((await fixture.finish(request('grammar', { week: 2 }))).status, 200);
  assert.equal((await fixture.finish(request('grammar', { week: 3 }))).status, 200);
  const [future, order] = fixture.tables.error_review_cards;
  assert.equal(future.prompt_sentence, 'I will visit my parents.');
  assert.equal(future.corrected_sentence, "I'm visiting my parents.");
  assert.equal(future.context_sentence, "I can't come on Saturday. I will visit my parents. We arranged it last week.");
  assert.equal(order.prompt_sentence, 'What time you usually do get home?');
  assert.equal(order.corrected_sentence, 'What time do you usually get home?');
  assert.equal(order.context_sentence, 'Put the words in order: What time / you / usually / do / get home?');

  assert.equal((await fixture.finish(request('grammar', { week: 2 }))).status, 200);
  assert.equal((await fixture.finish(request('grammar', { week: 3 }))).status, 200);
  assert.equal(fixture.tables.error_review_cards.length, 2, 're-Finish deduplicates by the original exercise');
});

function sevenGrammarAnswers(fixture) {
  const values = [
    ['W1-M1', 'No', true], ['W1-M2', 'waiting', true], ['W1-M3', 'No', false],
    ['W1-C1', 'moved', true], ['W1-C2', 'have made', true], ['W1-C3', 'had left', true],
    // An old false mark for a valid alternative is corrected on read.
    ['W1-C5', 'Did ... live', false],
  ];
  for (const [id, answer, correct] of values) fixture.addAttempt('week_grammar_attempts', id, answer, correct);
}

test('real finish route counts seven checked questions, adds only the wrong one, and reloads the same snapshot', async () => {
  const fixture = setup();
  sevenGrammarAnswers(fixture);
  fixture.addAttempt('week_grammar_attempts', 'W1-R1', 'optional rewrite', false);
  fixture.addAttempt('week_grammar_attempts', 'W1-E1', 'optional extra', false);
  fixture.addAttempt('week_grammar_attempts', 'unknown', 'not a question', false);
  fixture.addAttempt('week_grammar_attempts', 'W1-C4', 'other learner', false, 'someone-else');

  const response = await fixture.finish(request('grammar', { answered: 22, correct: 22, wrong: 0 }));
  assert.equal(response.status, 200);
  const summary = plain(response.body.summary);
  assert.deepEqual({ total: summary.total, answered: summary.answered, correct: summary.correct, wrong: summary.wrong },
    { total: 22, answered: 7, correct: 6, wrong: 1 });
  assert.equal(summary.sentence, 'You answered 7 of 22. 6 were right. Great work! You know this grammar well. You can come back and finish the other questions.');
  assert.equal(fixture.tables.error_review_cards.length, 1);
  assert.match(fixture.tables.error_review_cards[0].prompt_sentence, /^Answer this question: /);
  assert.equal(fixture.tables.error_review_cards[0].corrected_sentence, 'Yes');
  assert.deepEqual(plain(fixture.tables.week_skill_completions[0]).answered, 7);

  const reloaded = await fixture.progress.loadWeekPracticeProgress(1);
  assert.equal(reloaded.grammar.summary.sentence, summary.sentence);
  assert.equal(reloaded.grammar.summary.wrong, 1);
  assert.equal(reloaded.grammar.answers['W1-C5'].answer, 'Did ... live');
  assert.equal(reloaded.grammar.answers['W1-C5'].correct, true);
  assert.equal(reloaded.grammar.summary.scoreNeedsRefresh, false);
  assert.equal(fixture.tables.week_grammar_attempts.find((row) => row.item_id === 'W1-C5').correct, false,
    'reading a corrected mark does not rewrite the historical attempt');

  const repeat = await fixture.finish(request('grammar'));
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.summary.wrong, 1);
  assert.equal(fixture.tables.error_review_cards.length, 1, 'a duplicate card is not a new mistake');
  assert.equal(fixture.tables.week_skill_completions.length, 1);

  // A score is a snapshot until Finish is pressed again; returning to answer
  // another question does not silently change what was saved last time.
  fixture.addAttempt('week_grammar_attempts', 'W1-C4', 'was cooking', true);
  const changed = (await fixture.progress.loadWeekPracticeProgress(1)).grammar.summary;
  assert.equal(changed.sentence, summary.sentence);
  assert.equal(changed.scoreNeedsRefresh, true);
  const nextFinish = await fixture.finish(request('grammar'));
  assert.equal(nextFinish.body.summary.answered, 8);
  assert.equal(nextFinish.body.summary.correct, 7);
  assert.equal(nextFinish.body.summary.wrong, 1);
  assert.equal((await fixture.progress.loadWeekPracticeProgress(1)).grammar.summary.sentence, nextFinish.body.summary.sentence);
  assert.equal(fixture.tables.error_review_cards.length, 1);
});

test('vocabulary wrong answers use real word cards or a repair card, never an invented alias', async () => {
  const fixture = setup();
  fixture.addAttempt('week_vocabulary_attempts', 'V1-M1', 'a meaning', true);
  fixture.addAttempt('week_vocabulary_attempts', 'V1-T1', 'challenge', false);
  fixture.addAttempt('week_vocabulary_attempts', 'V1-C1', 'made', false);
  fixture.addAttempt('week_vocabulary_attempts', 'V1-F1', 'decisive', false);
  fixture.addAttempt('week_vocabulary_attempts', 'V1-S1', 'optional sentence', false);
  const response = await fixture.finish(request('vocabulary'));
  assert.equal(response.status, 200);
  assert.deepEqual(plain({ total: response.body.summary.total, answered: response.body.summary.answered,
    correct: response.body.summary.correct, wrong: response.body.summary.wrong }),
  { total: 16, answered: 4, correct: 1, wrong: 3 });
  assert.match(response.body.summary.sentence, /These words are new for you\. That's OK! Look at the words again/);
  assert.deepEqual(fixture.reviewUpdates, [{ userId: 'learner', term: 'make a big decision', correct: false, ensureOnly: true }]);
  assert.equal(fixture.tables.error_review_cards.length, 2);
  assert.equal(fixture.tables.error_review_cards[0].corrected_sentence, 'I took a risk and applied for a job abroad.');
  const reloaded = await fixture.progress.loadWeekPracticeProgress(1);
  assert.equal(reloaded.vocabulary.summary.sentence, response.body.summary.sentence);
  assert.equal(reloaded.vocabulary.summary.wrong, 3);
});

test('older incomplete Review snapshots do not claim all mistakes were saved', async () => {
  for (const skill of ['grammar', 'vocabulary']) {
    const fixture = setup();
    fixture.tables.week_skill_completions.push({
      user_id: 'learner', week_number: 1, skill,
      answered: 2, correct: 1, total: skill === 'grammar' ? 22 : 16,
      review_count: 0, completed_at: '2025-01-01T00:00:00Z',
    });
    const summary = (await fixture.progress.loadWeekPracticeProgress(1))[skill].summary;
    assert.equal(summary.wrong, 1);
    assert.equal(summary.reviewMistakes, 0);
    assert.match(summary.sentence, /Good effort! Press Finish again to add your mistakes to Review\./);
    assert.doesNotMatch(summary.sentence, /mistakes are in Review/);
  }
});

test('zero checked fixed questions cannot be finished even if an optional answer exists', async () => {
  const fixture = setup();
  fixture.addAttempt('week_grammar_attempts', 'W1-R1', 'optional rewrite', true);
  const response = await fixture.finish(request('grammar', { correct: 22, total: 22 }));
  assert.equal(response.status, 400);
  assert.equal(response.body.remaining, 22);
  assert.equal(fixture.tables.week_skill_completions.length, 0);
  assert.equal(fixture.tables.error_review_cards.length, 0);
});

test('the latest mark wins across pages and wrong multi-blank arrays restore and reach Review', async () => {
  const fixture = setup({ currentWeek: 4 });
  for (let index = 0; index < 500; index += 1) fixture.addAttempt('week_grammar_attempts', 'W4-G5', ['was', 'made'], true, 'learner', 4);
  fixture.addAttempt('week_grammar_attempts', 'W4-G5', ['is', 'make'], false, 'learner', 4);
  const response = await fixture.finish(request('grammar', { week: 4 }));
  assert.equal(response.status, 200);
  assert.deepEqual(plain({ answered: response.body.summary.answered, correct: response.body.summary.correct, wrong: response.body.summary.wrong }),
    { answered: 1, correct: 0, wrong: 1 });
  const reloaded = await fixture.progress.loadWeekPracticeProgress(4);
  assert.equal(reloaded.grammar.answers['W4-G5'].answer, 'is ... make');
  assert.equal(reloaded.grammar.answers['W4-G5'].correct, false);
  assert.equal(fixture.tables.error_review_cards[0].corrected_sentence, 'Where was your car made?');
});

test('old false grammar marks are corrected on read without changing stored attempts or the saved snapshot', async () => {
  const fixture = setup();
  fixture.addAttempt('week_grammar_attempts', 'W1-F2', 'when i got home my flatmate had already cooked dinner', false);
  fixture.addAttempt('week_grammar_attempts', 'W1-C5', 'Did ... live', false);
  fixture.addAttempt('week_grammar_attempts', 'W1-R2', 'when we arrived the film had already started', false);
  fixture.addAttempt('week_grammar_attempts', 'W1-U1', 'my own sentence', false);
  fixture.tables.week_skill_completions.push({ user_id: 'learner', week_number: 1, skill: 'grammar',
    answered: 2, correct: 0, total: 22, review_count: 2, completed_at: '2025-01-01T00:00:00Z' });

  const loaded = await fixture.progress.loadWeekPracticeProgress(1);
  assert.equal(loaded.grammar.answers['W1-F2'].correct, true);
  assert.equal(loaded.grammar.answers['W1-C5'].correct, true);
  assert.equal(loaded.grammar.answers['W1-R2'].correct, true);
  assert.equal(loaded.grammar.answers['W1-U1'].correct, false, 'open answers are not guessed on read');
  assert.equal(loaded.grammar.summary.correct, 0, 'a completion is still a snapshot');
  assert.equal(loaded.grammar.summary.scoreNeedsRefresh, true);
  assert.ok(fixture.tables.week_grammar_attempts.every((row) => row.correct === false), 'the audit does not rewrite old rows');

  const finished = await fixture.finish(request('grammar'));
  assert.deepEqual(plain({ answered: finished.body.summary.answered, correct: finished.body.summary.correct, wrong: finished.body.summary.wrong }),
    { answered: 2, correct: 2, wrong: 0 });
  assert.equal(fixture.tables.error_review_cards.length, 0, 'corrected and optional answers do not make a card');
  assert.equal((await fixture.progress.loadWeekPracticeProgress(1)).grammar.summary.scoreNeedsRefresh, false);
});

test('a later check marks a saved snapshot as stale even if its counts have not changed', async () => {
  const fixture = setup();
  fixture.addAttempt('week_grammar_attempts', 'W1-M1', 'No', true);
  await fixture.finish(request('grammar'));
  fixture.addAttempt('week_grammar_attempts', 'W1-M1', 'No', true);
  fixture.tables.week_grammar_attempts.at(-1).created_at = new Date(Date.now() + 5000).toISOString();
  const progress = await fixture.progress.loadWeekPracticeProgress(1);
  assert.equal(progress.grammar.summary.correct, 1);
  assert.equal(progress.grammar.summary.scoreNeedsRefresh, true);
});

test('Review, completion and attempt-read failures do not claim a successful finish', async () => {
  for (const [config, skill, item] of [
    [{ failCard: true }, 'grammar', ['W1-C1', 'have moved', false]],
    [{ failReview: true }, 'vocabulary', ['V1-T1', 'challenge', false]],
    [{ failCompletion: true }, 'grammar', ['W1-M1', 'No', true]],
    [{ failRead: true }, 'grammar', ['W1-M1', 'No', true]],
  ]) {
    const fixture = setup(config);
    fixture.addAttempt(skill === 'grammar' ? 'week_grammar_attempts' : 'week_vocabulary_attempts', ...item);
    const response = await fixture.finish(request(skill));
    assert.equal(response.status, 503);
    assert.equal(fixture.tables.week_skill_completions.length, 0);
    assert.doesNotMatch(JSON.stringify(response.body), /private|XX999/);
  }
});

test('old completion records do not count optional answers as mistakes on reload', async () => {
  const fixture = setup();
  fixture.tables.week_skill_completions.push({ user_id: 'learner', week_number: 1, skill: 'grammar',
    answered: 25, correct: 6, total: 22, review_count: 15 });
  const loaded = await fixture.progress.loadWeekPracticeProgress(1);
  assert.equal(loaded.grammar.summary.answered, 22);
  assert.equal(loaded.grammar.summary.correct, 6);
  assert.equal(loaded.grammar.summary.wrong, 16);
  assert.match(loaded.grammar.summary.sentence, /6 were right\./);
});
