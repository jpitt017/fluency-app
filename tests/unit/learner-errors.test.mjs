import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { scorePlacement } from '../../lib/b1b2/placement-scoring.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const generic = 'Something went wrong. Please try again, or message your teacher.';
const reviewError = 'We could not check your answer. Please try again.';

/** Execute the real review route with fake dependencies: never touch live data. */
function reviewRoute(createServerSupabase, logs) {
  const compiled = ts.transpileModule(read('src/app/api/srs/review/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const modules = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    zod: require('zod'),
    '@/utils/supabase/server': { createServerSupabase },
    '@/lib/b1b2/fsrs': { scheduleFsrsReview: () => ({ due_at: '2026-11-25T00:00:00Z' }) },
  };
  runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
    console: { error: (...args) => logs.push(args.map(String).join(' ')) },
  });
  return exports.POST;
}

const request = { json: async () => ({
  cardId: '1e3a92de-0df8-43dd-91e5-6843eb967330', cardType: 'vocab', grade: 'again',
}) };

test('a review database failure is logged but never returned to a learner', async () => {
  const logs = [];
  const secret = 'SQL failure: relation internal_review_table does not exist';
  const chain = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: { id: 'card' }, error: null }; },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    from: () => chain,
    rpc: async () => ({ data: null, error: { message: secret } }),
  };
  const result = await reviewRoute(async () => client, logs)(request);
  assert.equal(result.status, 500);
  assert.equal(result.body.error, reviewError);
  assert.ok(!JSON.stringify(result.body).includes(secret));
  assert.ok(logs.some((line) => line.includes(secret)), 'the diagnostic detail is kept in the log');
});

test('review handles missing configuration and unexpected exceptions without exposing their details', async () => {
  const logs = [];
  const missing = await reviewRoute(async () => null, logs)(request);
  assert.equal(missing.status, 503);
  assert.equal(missing.body.error, reviewError);
  const thrown = await reviewRoute(async () => { throw new Error('private technical detail'); }, logs)(request);
  assert.equal(thrown.status, 500);
  assert.equal(thrown.body.error, reviewError);
  assert.ok(logs.some((line) => line.includes('private technical detail')));
});

test('placement scoring logs technical failures instead of sending them to the learner', async () => {
  const logs = [];
  const compiled = ts.transpileModule(read('src/app/api/placement/score/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const modules = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/b1b2/data': { loadPlacementAnswerKey: async () => { throw new Error('private database detail'); } },
    '@/lib/b1b2/placement-scoring.mjs': { scorePlacement },
  };
  runInNewContext(compiled, { exports, require: (name) => modules[name], console: { error: (...args) => logs.push(args.map(String).join(' ')) } });
  const result = await exports.POST({ json: async () => ({ answers: [] }) });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'We could not check your answers. Please try again.');
  assert.ok(logs.some((line) => line.includes('private database detail')));
});

test('portfolio errors stay simple and keep the database detail in the log', async () => {
  const logs = [];
  const compiled = ts.transpileModule(read('src/app/api/checkpoints/portfolio/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const modules = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next/headers': { cookies: async () => ({ getAll: () => [] }) },
    '@supabase/ssr': { createServerClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'user' } }, error: null }) },
      from: () => { throw new Error('private portfolio database detail'); },
    }) },
  };
  runInNewContext(compiled, {
    exports, require: (name) => modules[name],
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fake' } },
    console: { error: (...args) => logs.push(args.map(String).join(' ')) },
  });
  const result = await exports.GET();
  assert.equal(result.status, 500);
  assert.equal(result.body.error, 'We could not load your work. Please try again.');
  assert.ok(logs.some((line) => line.includes('private portfolio database detail')));
});

test('login keeps technical errors in the log and gives actionable mistakes their own simple lines', () => {
  const login = read('src/app/login/page.tsx');
  const formatter = login.slice(login.indexOf('function formatAuthError'), login.indexOf('function LoginForm'));
  assert.match(login, /Something went wrong\. Please try again, or message your teacher\./);
  assert.match(formatter, /console\.error/);
  assert.match(formatter, /That email or password is not right/);
  assert.match(formatter, /Please confirm your email first/);
  assert.doesNotMatch(formatter, /return raw|return err\.message/);
});

test('learner-facing configuration errors are simple while teacher API wording stays unchanged', () => {
  const proxy = read('src/proxy.ts');
  assert.ok(proxy.includes(generic));
  assert.match(proxy, /pathname\.startsWith\('\/api\/teacher\/'\)/);
  assert.match(proxy, /console\.error\('\[proxy\]/);
  assert.match(read('src/app/layout.tsx'), /IssueReporter signedIn=\{summary\.signedIn\} isStaff=\{isStaff\}/);
  const reporter = read('components/b1b2/IssueReporter.tsx');
  assert.match(reporter, /isStaff \? 'Could not send\. Please try again\.'/);
  assert.ok(reporter.includes(generic));
  assert.ok(read('lib/b1b2/ai-guard.ts').includes(generic));
  for (const path of ['src/app/api/review/check-rewrite/route.ts', 'src/app/api/account/delete-data/route.ts']) {
    const source = read(path);
    assert.doesNotMatch(source, /error:\s*(?:rpcErr|weekDeleteError|err)\.message/);
    assert.doesNotMatch(source, /error:\s*err instanceof Error\s*\?\s*err\.message/);
  }
});
