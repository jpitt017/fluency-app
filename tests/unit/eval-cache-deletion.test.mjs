import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

const output = ts.transpileModule(readFileSync('lib/b1b2/eval-cache.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
runInNewContext(output, { exports, require(name) {
  if (name === 'node:crypto') return { createHash };
  throw new Error(`Unexpected module ${name}`);
} });
const { buildEvalCacheKey, readEvalCache, writeEvalCache } = exports;
const params = { endpoint: 'writing', model: 'test', response: { corrected: 'synthetic response' } };

test('new app with old schema never reads or writes the ownerless shared cache', async () => {
  const calls = [];
  const oldSchema = { rpc: async (name) => {
    calls.push(name);
    if (name === 'get_ai_eval_cache' || name === 'set_ai_eval_cache') throw new Error('ownerless cache is not safe');
    return { data: null, error: { code: 'PGRST202' } };
  } };
  const key = buildEvalCacheKey({ endpoint: 'writing', model: 'test', prompt: 'prompt', input: 'learner text' });
  assert.equal(await readEvalCache(oldSchema, key), null);
  await writeEvalCache(oldSchema, { ...params, cacheKey: key });
  assert.deepEqual(calls, ['get_owned_ai_eval_cache', 'set_owned_ai_eval_cache']);
});

test('new app uses the owned RPC and treats cache failures as non-blocking', async () => {
  const calls = [];
  const scoped = { rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'get_owned_ai_eval_cache') return { data: { corrected: 'synthetic' }, error: null };
    return { data: null, error: null };
  } };
  assert.equal((await readEvalCache(scoped, 'key')).corrected, 'synthetic');
  await writeEvalCache(scoped, { ...params, cacheKey: 'key' });
  assert.equal(calls[1].name, 'set_owned_ai_eval_cache');
  assert.equal(calls[1].args.p_cache_key, 'key');
  assert.equal(calls[1].args.p_response.corrected, 'synthetic response');
  assert.equal(await readEvalCache({ rpc: async () => { throw new Error('network'); } }, 'key'), null);
  await writeEvalCache({ rpc: async () => { throw new Error('network'); } }, { ...params, cacheKey: 'key' });
});
