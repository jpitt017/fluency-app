// Runs only against the disposable replay database immediately before 0081.
// Applies 0081 inside a rolled-back transaction, so the real replay can then
// apply it normally. It must never be pointed at a live project.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const db = process.env.TEST_DATABASE_URL;
if (!db || !/^postgres(?:ql)?:\/\/(?:[^@/]+@)?(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(db)) {
  throw new Error('Use only the disposable local replay database');
}
const client = new pg.Client({ connectionString: db });
const owner = randomUUID();
const other = randomUUID();
const key = 'synthetic-old-cache';
const migration = readFileSync('supabase-b1-b2/migrations/0081_retryable_learning_data_deletion.sql', 'utf8');
await client.connect();
try {
  await client.query('BEGIN');
  const initial = await client.query("select to_regprocedure('public.get_owned_ai_eval_cache(text)') as owned");
  assert.equal(initial.rows[0].owned, null, 'fixture must start on 0080');
  await client.query(`insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,aud,role)
    values ($1,'scope-a@example.invalid','{}','{}','authenticated','authenticated'),
           ($2,'scope-b@example.invalid','{}','{}','authenticated','authenticated')`, [owner, other]);
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  await client.query("select public.set_ai_eval_cache($1,'writing','test','{\"feedback\":\"old global value\"}'::jsonb)", [key]);
  const legacy = await client.query('select count(*)::int as n from public.ai_evaluation_cache where cache_key=$1', [key]);
  assert.equal(legacy.rows[0].n, 1, 'old ownerless entry must really exist');
  await client.query('SAVEPOINT old_schema');

  await client.query(migration);
  const replayedDefinition = (await client.query("select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) as body")).rows[0].body;
  assert.doesNotMatch(replayedDefinition, /delete from public\.ai_evaluation_cache\s+where last_hit_at/i,
    'a deletion must not prune another owner’s cache');
  const removed = await client.query('select count(*)::int as n from public.ai_evaluation_cache where cache_key=$1', [key]);
  assert.equal(removed.rows[0].n, 0, 'unattributable pre-migration feedback must be discarded');
  const grants = await client.query(`select
    has_function_privilege('anon','public.get_owned_ai_eval_cache(text)','execute') as anonymous,
    has_function_privilege('authenticated','public.get_owned_ai_eval_cache(text)','execute') as authenticated,
    has_function_privilege('authenticated','public.set_owned_ai_eval_cache(text,text,text,jsonb)','execute') as writer`);
  assert.deepEqual(grants.rows[0], { anonymous: false, authenticated: true, writer: true });

  // The unchanged old RPC signatures still work with the expanded schema.
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  await client.query("select public.set_ai_eval_cache($1,'writing','test','{\"feedback\":\"first owner\"}'::jsonb)", [key]);
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [other]);
  const miss = await client.query('select public.get_ai_eval_cache($1) as response', [key]);
  assert.equal(miss.rows[0].response, null, 'old reader cannot see another owner');
  await client.query("select public.set_ai_eval_cache($1,'writing','test','{\"feedback\":\"second owner\"}'::jsonb)", [key]);
  const second = await client.query('select public.get_owned_ai_eval_cache($1) as response', [key]);
  assert.equal(second.rows[0].response.feedback, 'second owner');
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  const first = await client.query('select public.get_owned_ai_eval_cache($1) as response', [key]);
  assert.equal(first.rows[0].response.feedback, 'first owner');

  const job = randomUUID();
  const begun = await client.query('select public.begin_week_speaking_deletion($1,$2) as ok', [owner, job]);
  assert.equal(begun.rows[0].ok, true);
  const completed = await client.query('select public.finish_week_speaking_deletion($1,$2) as result', [owner, job]);
  assert.equal(completed.rows[0].result.deleted, true);
  const remaining = await client.query('select cache_owner_id::text as owner from public.ai_evaluation_cache order by cache_owner_id');
  assert.deepEqual(remaining.rows.map((row) => row.owner), [other]);

  // The inspected live 0080 function has no cache statement, unlike the replay
  // copy. That shape must expand unchanged; an unrecognized cache statement
  // must abort instead of silently rewriting an unknown live function.
  await client.query('ROLLBACK TO SAVEPOINT old_schema');
  const before = (await client.query("select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) as body")).rows[0].body;
  const oldExpiry = "delete from public.ai_evaluation_cache\n   where last_hit_at < now() - interval '90 days';";
  assert.ok(before.includes(oldExpiry), 'replay fixture has the expected old expiry clause');
  const unexpectedDefinitions = [
    ['different expiry', before.replace(oldExpiry, oldExpiry.replace('90 days', '89 days'))],
    ['extra qualified delete', before.replace(oldExpiry, `${oldExpiry}\n  delete from public.ai_evaluation_cache where endpoint = 'unknown';`)],
    ['extra unqualified uppercase reference', before.replace(oldExpiry, `${oldExpiry}\n  PERFORM 1 FROM AI_EVALUATION_CACHE;`)],
    ['extra quoted reference', before.replace(oldExpiry, `${oldExpiry}\n  perform 1 from "public"."ai_evaluation_cache";`)],
    ['duplicate known expiry', before.replace(oldExpiry, `${oldExpiry}\n  ${oldExpiry}`)],
    ['unqualified unknown clause without known expiry', before.replace(oldExpiry, 'delete from ai_evaluation_cache where true;')],
  ];
  for (const [label, definition] of unexpectedDefinitions) {
    await client.query(definition);
    await assert.rejects(() => client.query(migration), /Unexpected cache deletion/, label);
    await client.query('ROLLBACK TO SAVEPOINT old_schema');
  }
  await client.query(before.replace(oldExpiry, '-- Simulated inspected live 0080 function has no cache statement.'));
  const liveLike = (await client.query("select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) as body")).rows[0].body;
  await client.query(migration);
  const expandedLiveLike = (await client.query("select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) as body")).rows[0].body;
  assert.equal(expandedLiveLike, liveLike, 'live-like deletion function was unexpectedly changed');
  console.log('PASS: 0081 purges ownerless cache, preserves RPC isolation, and guards replay/live deletion-function variants.');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
