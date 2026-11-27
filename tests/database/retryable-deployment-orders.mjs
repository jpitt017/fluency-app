// Disposable localhost PostgreSQL, immediately before 0081. The actual old and
// new route handlers drive real 0080/0081 SQL through a small PostgREST adapter.
// Storage is a metadata-backed fake here; the isolated RLS suite also uses the
// real Storage API. Everything is rolled back, including the trial migration.
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import pg from 'pg';
import ts from 'typescript';
import * as deletion from '../../lib/b1b2/retryable-data-deletion.mjs';

const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl) throw new Error('A disposable TEST_DATABASE_URL is required');
const url = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname)
  || !url.port || url.pathname !== '/postgres' || url.search || url.hash) {
  throw new Error('Refusing to run rolling deployment tests against a non-local database');
}
// PostgREST returns timestamps as text with PostgreSQL's microseconds. The pg
// default Date parser truncates those digits and breaks equality-based claims.
pg.types.setTypeParser(1184, (value) => value);
const client = new pg.Client({ connectionString: rawUrl });
const ownerOldSchema = crypto.randomUUID();
const ownerNewSchema = crypto.randomUUID();
const ownerNewApp = crypto.randomUUID();
const other = crypto.randomUUID();
const migration = readFileSync('supabase-b1-b2/migrations/0081_retryable_learning_data_deletion.sql', 'utf8');
const OLD_ROUTE = readFileSync('tests/fixtures/delete-data-0080.route.txt', 'utf8');
const NEW_ROUTE = readFileSync('src/app/api/account/delete-data/route.ts', 'utf8');
const allowedTables = new Set(['week_speaking_deletion_locks', 'ai_evaluation_cache', 'data_deletion_safety_config',
  'issue_reports', 'speaking_attempts', 'week_speaking_attempts', 'week_speaking_takes']);
const rpcArgs = {
  begin_week_speaking_deletion: ['p_user_id', 'p_lock_id'],
  end_week_speaking_deletion: ['p_user_id', 'p_lock_id'],
  finish_week_speaking_deletion: ['p_user_id', 'p_lock_id'],
  promote_retryable_data_deletion: ['p_user_id', 'p_lock_id'],
  claim_retryable_data_deletion: ['p_user_id', 'p_lock_id'],
  release_retryable_data_deletion: ['p_user_id', 'p_lock_id', 'p_claim_until', 'p_claim_token'],
  list_retryable_deletion_files: ['p_user_id', 'p_lock_id', 'p_claim_until', 'p_claim_token', 'p_after_bucket', 'p_after_name'],
  finish_retryable_data_deletion: ['p_user_id', 'p_lock_id', 'p_claim_until', 'p_claim_token'],
};
const newerRpcs = new Set(['promote_retryable_data_deletion', 'claim_retryable_data_deletion',
  'release_retryable_data_deletion', 'list_retryable_deletion_files', 'finish_retryable_data_deletion']);
let expanded = false;
let partialRemoval = false;
let rpcSerial = 0;
let rangeQueue = Promise.resolve();

const quoted = (identifier) => {
  if (!/^[a-z_]+$/.test(identifier)) throw new Error('Invalid fixture identifier');
  return `"${identifier}"`;
};
const rowForApi = (row) => row && Object.fromEntries(Object.entries(row).map(([key, value]) =>
  [key, value instanceof Date ? value.toISOString() : value]));

const admin = {
  async rpc(name, args) {
    if (!(name in rpcArgs)) throw new Error(`Unexpected fixture RPC ${name}`);
    if (!expanded && newerRpcs.has(name)) return { data: null, error: { code: 'PGRST202' } };
    const keys = rpcArgs[name];
    const values = keys.map((key) => args[key]);
    while (values.length && values.at(-1) === undefined) values.pop();
    const savepoint = `rpc_${++rpcSerial}`;
    await client.query(`savepoint ${savepoint}`);
    try {
      // Each production PostgREST request has its own transaction context.
      await client.query("select set_config('request.jwt.claim.sub','',true), set_config('fluency.data_deletion_token','',true), set_config('request.headers','{}',true)");
      const result = await client.query(`select public.${quoted(name)}(${values.map((_, n) => `$${n + 1}`).join(',')}) as data`, values);
      await client.query(`release savepoint ${savepoint}`);
      return { data: result.rows[0].data, error: null };
    } catch (error) {
      await client.query(`rollback to savepoint ${savepoint}`);
      await client.query(`release savepoint ${savepoint}`);
      return { data: null, error: { code: error.code, message: error.message } };
    }
  },
  from(table) {
    if (!allowedTables.has(table)) throw new Error(`Unexpected fixture table ${table}`);
    let columns = '*';
    let update = null;
    let operation = 'select';
    const filters = [];
    const where = (values) => filters.length ? `where ${filters.map(([key, value]) => {
      values.push(value); return `${quoted(key)}=$${values.length}`;
    }).join(' and ')}` : '';
    const query = {
      select: (value) => { columns = value; return query; },
      update: (value) => { operation = 'update'; update = value; return query; },
      delete: () => { operation = 'delete'; return query; },
      eq: (key, value) => { filters.push([key, value]); return query; },
      order: () => query,
      not: async (key, op, value) => {
        assert.equal(table, 'ai_evaluation_cache');
        assert.equal(operation, 'delete');
        assert.equal(key, 'cache_key'); assert.equal(op, 'is'); assert.equal(value, null);
        await client.query('delete from public.ai_evaluation_cache where cache_key is not null');
        return { error: null };
      },
      maybeSingle: async () => {
        if (!expanded && table === 'data_deletion_safety_config') return { data: null, error: { code: 'PGRST205' } };
        const values = [];
        const projection = columns === '*' ? '*' : columns.split(',').map(quoted).join(',');
        let sql;
        if (operation === 'update') {
          const sets = Object.entries(update).map(([key, value]) => { values.push(value); return `${quoted(key)}=$${values.length}`; });
          sql = `update public.${quoted(table)} set ${sets.join(',')} ${where(values)} returning ${projection}`;
        } else sql = `select ${projection} from public.${quoted(table)} ${where(values)}`;
        const result = await client.query(sql, values);
        return { data: rowForApi(result.rows[0] ?? null), error: null };
      },
      range: (start, end) => {
        // The old route reads four tables concurrently. Serialize the fixture's
        // single PG connection, just as separate PostgREST requests would do.
        const pending = rangeQueue.then(async () => {
          const values = [];
          const projection = columns.split(',').map(quoted).join(',');
          const result = await client.query(`select ${projection} from public.${quoted(table)} ${where(values)} order by id`, values);
          return { data: result.rows.slice(start, end + 1), count: result.rows.length, error: null };
        });
        rangeQueue = pending.catch(() => {});
        return pending;
      },
    };
    return query;
  },
  storage: { from(bucket) {
    assert.ok(['speaking-recordings', 'issue-attachments'].includes(bucket));
    return {
      async list(prefix, { limit, offset }) {
        const all = (await client.query('select name from storage.objects where bucket_id=$1 and name like $2 order by name', [bucket, `${prefix}/%`])).rows;
        const names = new Map();
        for (const { name } of all) {
          const [leaf, ...rest] = name.slice(prefix.length + 1).split('/');
          names.set(leaf, { name: leaf, id: rest.length ? null : leaf });
        }
        return { data: [...names.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit), error: null };
      },
      async remove(paths) {
        const take = partialRemoval ? paths.slice(0, 1) : paths;
        const result = await client.query('delete from storage.objects where bucket_id=$1 and name=any($2::text[]) returning name', [bucket, take]);
        if (partialRemoval) { partialRemoval = false; return { data: null, error: { message: 'synthetic partial failure' } }; }
        return { data: result.rows, error: null };
      },
    };
  } },
};

function route(source, owner) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, crypto, Buffer, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key' } },
    console: { error() {} }, require(name) {
      if (name === 'node:crypto') return crypto;
      if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } };
      if (name === '@/lib/b1b2/retryable-data-deletion.mjs') return deletion;
      if (name === '@/utils/supabase/admin') return { createAdminSupabase: () => admin };
      if (name === '@/utils/supabase/server') return { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) } }) };
      throw new Error(`Unexpected route dependency ${name}`);
    } });
  return exports.POST;
}
const request = (body) => ({ json: async () => body });
async function seedUser(user) {
  await client.query("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,aud,role) values ($1,$2,'{}','{}','authenticated','authenticated')", [user, `${user}@example.invalid`]);
  await client.query("insert into public.week_input_submissions(user_id,week_number,skill) values($1,1,'reading')", [user]);
}
async function countRows(user) {
  return (await client.query('select count(*)::int as n from public.week_input_submissions where user_id=$1', [user])).rows[0].n;
}
async function seedObject(user, bucket, name) {
  const path = `${user}/${name}`;
  await client.query('insert into storage.objects(bucket_id,name) values($1,$2)', [bucket, path]);
  return path;
}
async function exists(bucket, path) {
  return (await client.query('select exists(select 1 from storage.objects where bucket_id=$1 and name=$2) as found', [bucket, path])).rows[0].found;
}

try {
  await client.connect();
  await client.query('begin');
  await client.query("select set_config('storage.allow_delete_query','true',true)");
  assert.equal((await client.query("select to_regprocedure('public.promote_retryable_data_deletion(uuid,uuid)') as value")).rows[0].value, null);
  for (const user of [ownerOldSchema, ownerNewSchema, ownerNewApp, other]) await seedUser(user);
  const oldSchemaPath = await seedObject(ownerOldSchema, 'issue-attachments', 'old-schema.png');
  const oldSchemaOther = await seedObject(other, 'issue-attachments', 'other.png');
  await client.query("insert into public.ai_evaluation_cache(cache_key,endpoint,model,response) values('legacy-entry','writing','test','{\"feedback\":\"old\"}'::jsonb)");

  // New route + old schema: a failed Storage call must keep rows and a durable
  // job; retry with the exact signed receipt clears the ownerless cache as well.
  const newOnOld = route(NEW_ROUTE, ownerOldSchema);
  const beginOld = await newOnOld(request({ confirm: 'DELETE', phase: 'begin' }));
  assert.equal(beginOld.status, 200, JSON.stringify(beginOld.body));
  partialRemoval = true;
  assert.equal((await newOnOld(request({ confirm: 'DELETE', phase: 'finish', receipt: beginOld.body.receipt }))).status, 503);
  assert.equal(await countRows(ownerOldSchema), 1);
  const retryOld = await newOnOld(request({ confirm: 'DELETE', phase: 'finish', receipt: beginOld.body.receipt }));
  assert.equal(retryOld.status, 200);
  assert.equal(retryOld.body.deleted, true);
  assert.equal(await countRows(ownerOldSchema), 0);
  assert.equal(await exists('issue-attachments', oldSchemaPath), false);
  assert.equal(await exists('issue-attachments', oldSchemaOther), true);
  assert.equal((await client.query('select count(*)::int as n from public.ai_evaluation_cache')).rows[0].n, 0);

  // Expand transactionally, then drive the unchanged old route against it.
  await client.query("select set_config('request.jwt.claim.sub','',true), set_config('fluency.data_deletion_token','',true)");
  await client.query(migration);
  expanded = true;
  const oldPath = await seedObject(ownerNewSchema, 'issue-attachments', 'old-client.png');
  const orphan = await seedObject(ownerNewSchema, 'issue-attachments', 'old-orphan.png');
  await client.query("insert into public.issue_reports(user_id,type,message,page_url,screenshot_path) values($1,'feedback','synthetic','/test',$2)", [ownerNewSchema, oldPath]);
  const oldOnNew = route(OLD_ROUTE, ownerNewSchema);
  partialRemoval = true;
  assert.equal((await oldOnNew(request({ confirm: 'DELETE' }))).status, 503);
  assert.equal(await countRows(ownerNewSchema), 1);
  assert.equal((await oldOnNew(request({ confirm: 'DELETE' }))).status, 200);
  assert.equal(await countRows(ownerNewSchema), 0);
  assert.equal(await exists('issue-attachments', oldPath), false);
  assert.equal(await exists('issue-attachments', orphan), true); // old route never listed unreferenced keys
  assert.equal((await client.query("select exists(select 1 from public.list_late_deletion_files('','',100,$1) where object_name=$2) as found", [ownerNewSchema, orphan])).rows[0].found, true);
  assert.equal(await exists('issue-attachments', oldSchemaOther), true);

  // New route + expanded schema: the real fenced listing/finalizer uses Storage
  // metadata, including orphans, and retries the same receipt after failure.
  const newPath = await seedObject(ownerNewApp, 'speaking-recordings', 'unreferenced.webm');
  const newOnNew = route(NEW_ROUTE, ownerNewApp);
  const beginNew = await newOnNew(request({ confirm: 'DELETE', phase: 'begin' }));
  assert.equal(beginNew.status, 200);
  partialRemoval = true;
  assert.equal((await newOnNew(request({ confirm: 'DELETE', phase: 'finish', receipt: beginNew.body.receipt }))).status, 503);
  assert.equal(await countRows(ownerNewApp), 1);
  const retryNew = await newOnNew(request({ confirm: 'DELETE', phase: 'finish', receipt: beginNew.body.receipt }));
  assert.equal(retryNew.status, 200);
  assert.equal(retryNew.body.deleted, true);
  assert.equal(await exists('speaking-recordings', newPath), false);
  assert.equal(await countRows(ownerNewApp), 0);
  assert.equal(await countRows(other), 1);
  console.log('PASS: real 0080/0081 database with old/new route handlers, Storage failure and retry in both deployment orders.');
} finally {
  await client.query('rollback').catch(() => {});
  await client.end().catch(() => {});
}
