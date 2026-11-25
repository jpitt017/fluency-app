import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { markGloss } from '../../lib/curriculum/listening-support.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const content = JSON.parse(read('supabase-b1-b2/content/curriculum/listening-support-weeks-01-04.json'));
const firstItem = content.weeks.find((week) => week.week === 1).glossCheck[0];
const answer = firstItem.options[firstItem.answerIndex];
const request = (body) => ({ json: async () => body });

function makePost({ progressThrows = false, progressError = null, saveThrows = false, saveError = null } = {}) {
  const logs = [];
  const writes = [];
  let postgrestOptions = null;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'learner-1' } } }) },
    async rpc(name) {
      assert.equal(name, 'refresh_current_week');
      if (progressThrows) throw new Error('database statement timeout while refreshing');
      return { data: 1, error: progressError };
    },
  };
  const admin = {
    from(table) {
      assert.equal(table, 'week_input_answers');
      return {
        async upsert(row, options) {
          if (saveThrows) throw new Error('database timeout while saving');
          if (saveError) return { error: saveError };
          writes.push(row);
          postgrestOptions = options;
          return { error: null };
        },
      };
    },
  };

  const compiled = ts.transpileModule(read('src/app/api/week/listening/gloss/route.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  const modules = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/supabase-b1-b2/content/curriculum/listening-support-weeks-01-04.json': content,
    '@/lib/curriculum/listening-support.mjs': { markGloss },
    '@/utils/supabase/server': { createServerSupabase: async () => client },
    '@/utils/supabase/admin': { createAdminSupabase: () => admin },
  };
  runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
    console: {
      error: (...parts) => logs.push(parts.map((part) => part?.message ?? String(part)).join(' ')),
    },
  });
  return { post: exports.POST, logs, writes, getPostgrestOptions: () => postgrestOptions };
}

const validRequest = () => request({ week: 1, itemId: 'gloss-1-1', answer });

test('a thrown database timeout while checking progress becomes a retryable 503, not an unhandled 500', async () => {
  const fixture = makePost({ progressThrows: true });
  const response = await fixture.post(validRequest());
  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'Could not check your progress. Please try again.');
  assert.equal(fixture.writes.length, 0, 'do not attempt a save until the week gate is checked');
  assert.match(fixture.logs.join('\n'), /database statement timeout/);
  assert.doesNotMatch(JSON.stringify(response.body), /database|timeout/i);
});

test('a thrown database timeout while saving returns a generic retryable error', async () => {
  const fixture = makePost({ saveThrows: true });
  const response = await fixture.post(validRequest());
  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'Could not save your answer. Please try again.');
  assert.match(fixture.logs.join('\n'), /database timeout while saving/);
  assert.doesNotMatch(JSON.stringify(response.body), /database|timeout/i);
});

test('a saved listening gloss response is returned only after the idempotent upsert succeeds', async () => {
  const fixture = makePost();
  const response = await fixture.post(validRequest());
  assert.equal(response.status, 200);
  assert.equal(response.body.correct, true);
  assert.equal(response.body.answer, answer);
  assert.equal(Object.hasOwn(response.body, 'answerIndex'), false);
  assert.equal(JSON.stringify(fixture.writes), JSON.stringify([{
    user_id: 'learner-1',
    week_number: 1,
    skill: 'listening',
    item_id: 'gloss-1-1',
    answer,
    correct: true,
  }]));
  assert.equal(JSON.stringify(fixture.getPostgrestOptions()), JSON.stringify({ onConflict: 'user_id,week_number,skill,item_id' }));
});
