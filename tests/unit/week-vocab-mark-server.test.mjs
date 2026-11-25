import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as marking from '../../lib/curriculum/vocabulary-marking.mjs';
import * as links from '../../lib/curriculum/vocabulary-review-link.mjs';

const source = readFileSync(new URL('../../src/app/api/week/vocabulary/mark/route.ts', import.meta.url), 'utf8');
const bank = JSON.parse(readFileSync(new URL('../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json', import.meta.url)));

/** Execute the real marking route with a deterministic in-memory database. */
function setup({ signedIn = true, progressError = false, currentWeek = 1, adminAvailable = true, insertError = false } = {}) {
  const attempts = [];
  const reviewUpdates = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'learner' } : null } }) },
    rpc: async () => progressError ? { data: null, error: { message: 'private progress failure' } } : { data: currentWeek, error: null },
  };
  const admin = {
    from(table) {
      assert.equal(table, 'week_vocabulary_attempts');
      return { insert: async (row) => {
        if (insertError) return { error: { message: 'private storage failure' } };
        attempts.push(row);
        return { error: null };
      } };
    },
  };
  const modules = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json': bank,
    '@/lib/curriculum/vocabulary-marking.mjs': marking,
    '@/lib/curriculum/vocabulary-review-link.mjs': links,
    '@/lib/b1b2/week-vocab-review': { updateReviewFromWeeklyPractice: async (_admin, user, term, correct) => {
      reviewUpdates.push({ user, term, correct });
      return { updated: true };
    } },
    '@/utils/supabase/server': { createServerSupabase: async () => client },
    '@/utils/supabase/admin': { createAdminSupabase: () => adminAvailable ? admin : null },
  };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
    console: { error() {} },
  });
  return { attempts, reviewUpdates, post: (body) => exports.POST({ json: async () => body }) };
}

const answer = (value) => ({ week: 1, id: 'V1-F1', answer: value });

test('V1-F1 is deterministic for every option and the saved mark matches the response', async () => {
  const fixture = setup();
  const forms = [['decision', false], ['decisive', false], ['decide', false], ['indecisive', true]];
  for (let repetition = 0; repetition < 100; repetition += 1) {
    for (const [value, expected] of forms) {
      const response = await fixture.post(answer(value));
      assert.equal(response.status, 200, value);
      assert.equal(response.body.correct, expected, value);
      assert.equal(fixture.attempts.at(-1).answer, value);
      assert.equal(fixture.attempts.at(-1).correct, expected, value);
    }
  }
  assert.equal(fixture.attempts.length, 400);
  assert.equal(fixture.reviewUpdates.length, 0, 'word forms have no linked word card');
});

test('failed authentication, progress or saving cannot return or save a false mark', async () => {
  for (const [options, status] of [
    [{ signedIn: false }, 401],
    [{ currentWeek: 0 }, 403],
    [{ progressError: true }, 503],
    [{ adminAvailable: false }, 503],
    [{ insertError: true }, 503],
  ]) {
    const fixture = setup(options);
    const response = await fixture.post(answer('indecisive'));
    assert.equal(response.status, status);
    assert.equal('correct' in response.body, false);
    assert.doesNotMatch(JSON.stringify(response.body), /private/);
    assert.equal(fixture.attempts.length, 0);
  }
  const fixture = setup();
  const invalid = await fixture.post(answer('not an option'));
  assert.equal(invalid.status, 400);
  assert.equal('correct' in invalid.body, false);
  assert.equal(fixture.attempts.length, 0);
});

test('a linked word is reviewed only after its actual mark is saved', async () => {
  const fixture = setup();
  const word = bank.weeks[0].match.items[0];
  const response = await fixture.post({ week: 1, id: word.id, answer: word.meaning });
  assert.equal(response.status, 200);
  assert.equal(response.body.correct, true);
  assert.equal(fixture.attempts[0].correct, true);
  assert.deepEqual(fixture.reviewUpdates, [{ user: 'learner', term: word.word, correct: true }]);
});
