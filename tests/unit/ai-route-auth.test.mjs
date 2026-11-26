import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const proxy = readFileSync('src/proxy.ts', 'utf8');
const pathBlock = proxy.match(/const AI_PROTECTED_PATHS = new Set\(\[([\s\S]*?)\]\)/)?.[1];
const paths = [...(pathBlock ?? '').matchAll(/'([^']+)'/g)].map(match => match[1]);

// Source-level contract: new proxy-protected routes must be explicitly audited.
// Live signed-out requests in the E2E suite supplement this structural check.
test('all proxy-protected routes authenticate before any AI work', () => {
  const aiCalls = {
    '/api/speaking/chat': 'groq.chat.completions.create(',
    '/api/speaking/evaluate': 'groq.audio.transcriptions.create(',
    '/api/speaking/transcribe': 'transcribeAudio(audio)',
    '/api/writing/correct': 'createGroqJsonCompletion(groq,',
    '/api/mediation/feedback': 'createGroqJsonCompletion(new Groq(',
    '/api/review/check-rewrite': 'await checkSemanticEquivalence(',
  };
  assert.deepEqual([...paths].sort(), Object.keys(aiCalls).sort(), 'Audit any added or removed protected route');
  for (const path of paths) {
    const source = readFileSync(`src/app${path}/route.ts`, 'utf8');
    const handler = source.slice(source.indexOf('export async function POST('));
    assert.ok(handler.length > 0, `${path} has a POST handler`);
    const guard = handler.indexOf('await enforceAiUsage(');
    const ai = handler.indexOf(aiCalls[path]);
    assert.ok(guard >= 0 && ai > guard, `${path}: quota guard precedes AI work`);
    assert.match(handler.slice(guard, ai), /if \(!guard\.allowed && guard\.response\)\s*\{[\s\S]*?return guard\.response;/, `${path}: denied guard returns`);
    if (path === '/api/review/check-rewrite') {
      assert.match(handler.slice(0, guard), /await supabase\.auth\.getUser\(\)/);
      assert.match(handler.slice(0, guard), /if \(!user\)\s*\{[\s\S]*?status: 401/);
    }
  }
});

test('proxy refreshes the session but leaves authorization to the routes', () => {
  assert.match(proxy, /await supabase\.auth\.getUser\(\)/);
  assert.match(proxy, /status: 503/);
  assert.doesNotMatch(proxy, /status: 401/);
  assert.match(proxy, /request\.cookies\.set\(name, value\)/);
  assert.match(proxy, /response\.cookies\.set\(name, value/);
});

test('only the public example GET bypasses the no-Supabase API fail-closed rule', async () => {
  const compiled = ts.transpileModule(proxy, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports, process: { env: {} }, console: { error() {} },
    require(name) {
      if (name === 'next/server') return { NextResponse: {
        next: () => ({ status: 200 }),
        json: (body, init) => ({ body, status: init.status }),
      } };
      if (name === '@supabase/ssr') return { createServerClient: () => { throw new Error('No client expected'); } };
      throw new Error(name);
    },
  });
  const request = (pathname, method = 'GET') => ({
    method, nextUrl: { pathname, searchParams: new URLSearchParams() },
  });
  assert.equal((await exports.proxy(request('/api/week/sentence/example'))).status, 200);
  assert.equal((await exports.proxy(request('/api/week/sentence/example', 'POST'))).status, 503);
  assert.equal((await exports.proxy(request('/api/week/sentence', 'POST'))).status, 503);
  assert.equal((await exports.proxy(request('/api/writing/correct', 'POST'))).status, 503);
});
