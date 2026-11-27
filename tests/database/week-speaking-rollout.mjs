// Only for a disposable local replay DB immediately before migration 0080.
// Run the print-only rollout inside a transaction and roll everything back.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { prepareRollout } from '../../scripts/prepare-week-speaking-0080-rollout.mjs';

const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl) throw new Error('TEST_DATABASE_URL is required for the disposable local database.');
const parsed = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
  || !['127.0.0.1', '[::1]'].includes(parsed.hostname)
  || !parsed.port || parsed.pathname !== '/postgres' || parsed.search || parsed.hash) {
  throw new Error('Refusing to test rollout against a non-local database.');
}
const client = new pg.Client({ connectionString: rawUrl });
const migration = readFileSync('supabase-b1-b2/migrations/0080_week_speaking_feedback.sql', 'utf8');
const capture = (definition) => ({ definition, definition_md5: createHash('md5').update(definition).digest('hex') });

try {
  await client.connect();
  await client.query('begin');
  await client.query('create schema if not exists supabase_migrations');
  await client.query('create table if not exists supabase_migrations.schema_migrations(version text primary key, name text, statements text[])');
  const definition = (await client.query("select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) as definition")).rows[0].definition;

  await client.query('savepoint bad_before_state');
  await assert.rejects(() => client.query(prepareRollout(migration, capture(`${definition}-- changed`))), /differs from the captured live definition/);
  await client.query('rollback to savepoint bad_before_state');

  const rollout = prepareRollout(migration, capture(definition));
  await client.query(rollout);
  const row = (await client.query("select version, name, statements from supabase_migrations.schema_migrations where version='0080'")).rows[0];
  assert.equal(row.name, 'week_speaking_feedback');
  assert.equal(row.statements[0], migration);
  assert.ok((await client.query("select to_regclass('public.week_speaking_takes') as table_name")).rows[0].table_name);
  assert.match((await client.query("select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) as definition")).rows[0].definition, /public\.week_speaking_takes/);

  await client.query('savepoint duplicate_rollout');
  await assert.rejects(() => client.query(rollout), /Migration 0080 or its objects already exist/);
  await client.query('rollback to savepoint duplicate_rollout');
  console.log('PASS: guarded 0080 rollout is atomic, stores the exact migration, and refuses drift or reapplication.');
} finally {
  await client.query('rollback').catch(() => {});
  await client.end().catch(() => {});
}
