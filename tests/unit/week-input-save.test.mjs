import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { markInputAnswer } from '../../lib/curriculum/input-marking.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const reasons = JSON.parse(read('lib/curriculum/input-reasons.json'));
const questions = Object.fromEntries(['reading', 'listening'].map((skill) => [skill, details[skill].weeks[0].questions]));
const request = (body) => ({ json: async () => body });

/** Run the real route code with fake clients; never touch a real database. */
function route(path, dependencies, logs) {
  const compiled = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  const modules = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/supabase-b1-b2/content/curriculum/weeks-01-04-details.json': details,
    '@/lib/curriculum/input-reasons.json': reasons,
    '@/lib/curriculum/input-marking.mjs': { markInputAnswer },
    ...dependencies,
  };
  runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
    console: { error: (...args) => logs.push(args.map((arg) => {
      if (arg && typeof arg === 'object' && 'message' in arg) return String(arg.message);
      return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
    }).join(' ')) },
  });
  return exports.POST;
}

function setup({ noAdmin = false, writeError = null, throwWrite = false, readError = null, trial = null } = {}) {
  const attempts = [];
  const completions = [];
  const logs = [];
  let refreshes = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'learner-1' } } }) },
    rpc: async () => {
      throw new Error('task routes must not refresh progress');
    },
    from(table) {
      assert.equal(table, 'week_input_answers');
      const filters = {};
      const query = {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        then(resolve, reject) {
          const rows = attempts.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
          return Promise.resolve({ data: rows, error: readError }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const admin = noAdmin ? null : {
    from(table) {
      return {
        async upsert(row) {
          if (throwWrite) throw new Error('private database exception');
          if (writeError) return { error: { message: writeError } };
          if (table === 'week_input_answers') attempts.push(row);
          else if (table === 'week_input_submissions') completions.push(row);
          else throw new Error(`Unexpected table: ${table}`);
          return { error: null };
        },
      };
    },
  };
  const dependencies = {
    '@/utils/supabase/server': { createServerSupabase: async () => client },
    '@/lib/curriculum/stored-current-week': { readStoredCurrentWeek: async () => 1 },
    '@/utils/supabase/admin': { createAdminSupabase: () => admin },
    '@/lib/curriculum/learner-week': { loadLearnerWeek: async () => ({
      reading: { questions: questions.reading },
      listening: { questions: questions.listening },
    }) },
    '@/lib/curriculum/load-listening-audio': { loadPlayableTrialAudio: async () => trial },
  };
  return {
    attempts, completions, logs,
    refreshes: () => refreshes,
    mark: route('src/app/api/week/input/mark/route.ts', dependencies, logs),
    finish: route('src/app/api/week/input/route.ts', dependencies, logs),
  };
}

test('an input mark succeeds only after the answer is saved', async () => {
  const first = questions.reading[0];
  for (const config of [
    { noAdmin: true },
    { writeError: 'private SQL failure' },
    { throwWrite: true },
  ]) {
    const fixture = setup(config);
    const result = await fixture.mark(request({ week: 1, skill: 'reading', id: first.id, answer: first.options[0] }));
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'We could not save your answer. Please try again.');
    assert.equal(fixture.attempts.length, 0);
    assert.ok(fixture.logs.length > 0, 'the cause is logged');
    assert.doesNotMatch(JSON.stringify(result.body), /SQL|private|admin/i);
  }
  const fixture = setup();
  const result = await fixture.mark(request({ week: 1, skill: 'reading', id: first.id, answer: first.options[0] }));
  assert.equal(result.status, 200);
  assert.equal(result.body.correct, false);
  assert.equal(fixture.attempts.length, 1);
  assert.equal(fixture.attempts[0].item_id, first.id);
});

test('finish counts saved checked answers, not placeholders supplied by the browser', async () => {
  const fixture = setup();
  const forged = await fixture.finish(request({ week: 1, skill: 'reading', answers: Object.fromEntries(questions.reading.map((q) => [q.id, 'answered'])) }));
  assert.equal(forged.status, 400);
  assert.equal(fixture.completions.length, 0);

  for (const question of questions.reading) {
    const answer = question.options[0] ?? 'My answer';
    const result = await fixture.mark(request({ week: 1, skill: 'reading', id: question.id, answer }));
    assert.equal(result.status, 200, question.id);
  }
  assert.equal(fixture.attempts.length, questions.reading.length);
  assert.ok(fixture.attempts.some((row) => !row.correct), 'a checked wrong answer still counts as answered');
  const result = await fixture.finish(request({ week: 1, skill: 'reading' }));
  assert.equal(result.status, 200);
  assert.equal(result.body.saved, true);
  assert.equal(fixture.completions.length, 1);
  assert.equal(fixture.completions[0].week_number, 1);
  assert.equal(fixture.completions[0].skill, 'reading');
  assert.equal(fixture.refreshes(), 0, 'task requests read the stored value; a page visit owns the refresh');
});

test('a read failure cannot report a saved completion', async () => {
  const fixture = setup({ readError: { message: 'private read failure' } });
  const result = await fixture.finish(request({ week: 1, skill: 'reading' }));
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'We could not save your answers. Please try again.');
  assert.ok(fixture.logs.some((line) => line.includes('private read failure')));
  assert.equal(fixture.completions.length, 0);
});

test('a completion-write failure never reports that the week was saved', async () => {
  for (const config of [{ noAdmin: true }, { writeError: 'private SQL failure' }, { throwWrite: true }]) {
    const fixture = setup(config);
    for (const question of questions.reading) {
      fixture.attempts.push({ user_id: 'learner-1', week_number: 1, skill: 'reading', item_id: question.id });
    }
    const result = await fixture.finish(request({ week: 1, skill: 'reading' }));
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'We could not save your answers. Please try again.');
    assert.equal(fixture.completions.length, 0);
    assert.ok(fixture.logs.length > 0);
    assert.doesNotMatch(JSON.stringify(result.body), /SQL|private|admin/i);
  }
});

test('completion saves return the stored week without repeating the progress RPC', async () => {
  const fixture = setup();
  for (const question of questions.reading) {
    fixture.attempts.push({ user_id: 'learner-1', week_number: 1, skill: 'reading', item_id: question.id });
  }
  const result = await fixture.finish(request({ week: 1, skill: 'reading' }));
  assert.equal(result.status, 200);
  assert.equal(result.body.currentWeek, 1);
  assert.equal(fixture.refreshes(), 0);
});

test('listening completion uses the same approved-audio gate as the page', async () => {
  const unreleased = setup();
  assert.equal((await unreleased.finish(request({ week: 1, skill: 'listening' }))).status, 400);
  assert.equal(unreleased.completions.length, 0);

  const approved = setup({ trial: { audioUrl: 'https://example.test/approved.mp3' } });
  for (const question of questions.listening) {
    const result = await approved.mark(request({ week: 1, skill: 'listening', id: question.id, answer: question.options[0] ?? 'My answer' }));
    assert.equal(result.status, 200, question.id);
  }
  const result = await approved.finish(request({ week: 1, skill: 'listening' }));
  assert.equal(result.status, 200);
  assert.equal(approved.completions[0].skill, 'listening');
});
