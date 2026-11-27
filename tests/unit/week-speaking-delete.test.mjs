import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as deletion from '../../lib/b1b2/retryable-data-deletion.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const IDLE = '9999-12-31T23:59:59.000Z';
const audioPath = `${USER}/week-speaking/1/33333333-3333-4333-8333-333333333333/take-1.webm`;
const orphan = `${USER}/week-speaking/orphan.webm`;
const issuePath = `${USER}/issue/screenshot.png`;
const input = (body) => ({ json: async () => body });

class FakeAdmin {
  constructor({ expanded = true, strict = false, objects = null } = {}) {
    this.expanded = expanded;
    this.strict = strict;
    this.objects = objects ?? new Map([
      ['issue-attachments', new Set([issuePath, `${OTHER}/other.png`])],
      ['speaking-recordings', new Set([audioPath, orphan, `${OTHER}/other.webm`])],
    ]);
    this.rows = { issue_reports: [{ screenshot_path: issuePath, audio_path: null }], speaking_attempts: [],
      week_speaking_attempts: [{ first_recording_path: audioPath, second_recording_path: null }], week_speaking_takes: [] };
    this.calls = [];
    this.lock = null;
    this.learningRows = 3;
    // On 0080, cached feedback is shared and cannot be attributed to a user.
    this.legacyCache = ['owner-derived', 'another-owner-derived'];
    this.completed = 0;
    this.fault = {};
    this.tick = 0;
    this.storage = { from: (bucket) => ({
      list: async (prefix, { limit, offset = 0 }) => {
        this.calls.push(['list', bucket, prefix]);
        const names = new Map();
        for (const path of this.objects.get(bucket) ?? []) {
          if (!path.startsWith(`${prefix}/`)) continue;
          const [name, ...rest] = path.slice(prefix.length + 1).split('/');
          names.set(name, { name, id: rest.length ? null : name });
        }
        return { data: [...names.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit), error: null };
      },
      remove: async (paths) => {
        this.calls.push(['remove', bucket, [...paths], this.lock?.expires_at]);
        const store = this.objects.get(bucket) ?? new Set();
        if (this.fault.partialStorage) {
          this.fault.partialStorage = false;
          store.delete(paths[0]);
          return { data: null, error: { message: 'partial or ambiguous storage failure' } };
        }
        if (this.fault.storageBarrier) await this.fault.storageBarrier;
        const removed = paths.filter((path) => store.delete(path));
        return { data: removed.map((name) => ({ name })), error: null };
      },
    }) };
  }

  from(table) {
    let update = null;
    const filters = {};
    const query = {
      select: () => query,
      update: (value) => { update = value; return query; },
      delete: () => query,
      not: async (key, operator, value) => {
        if (table !== 'ai_evaluation_cache' || key !== 'cache_key' || operator !== 'is' || value !== null) throw new Error('Unexpected cache purge');
        this.calls.push(['purge-legacy-cache']);
        if (this.fault.cachePurge) { this.fault.cachePurge = false; return { error: { code: 'timeout' } }; }
        this.legacyCache = [];
        return { error: null };
      },
      eq: (key, value) => { filters[key] = value; return query; },
      order: () => query,
      range: async (start, end) => {
        const rows = this.rows[table] ?? [];
        this.calls.push(['rows', table]);
        return { data: rows.slice(start, end + 1), count: rows.length, error: null };
      },
      maybeSingle: async () => {
        if (table === 'data_deletion_safety_config') return this.expanded
          ? { data: { enforce_legacy_fence: this.strict }, error: null }
          : { data: null, error: { code: 'PGRST205' } };
        if (table !== 'week_speaking_deletion_locks') throw new Error(`Unexpected table ${table}`);
        const lock = this.lock;
        const matches = lock && Object.entries(filters).every(([key, value]) => lock[key] === value);
        if (!matches) return { data: null, error: null };
        if (update) this.lock = { ...lock, ...update };
        return { data: { ...this.lock }, error: null };
      },
    };
    return query;
  }

  async rpc(name, args) {
    this.calls.push(['rpc', name, { ...args }]);
    const missing = () => ({ data: null, error: { code: 'PGRST202' } });
    if (this.fault.missingBase && name === 'begin_week_speaking_deletion') return missing();
    if (name === 'begin_week_speaking_deletion') {
      if (this.lock && Date.parse(this.lock.expires_at) > Date.now()) return { data: false, error: null };
      this.lock = { user_id: args.p_user_id, lock_id: args.p_lock_id, expires_at: new Date(Date.now() + 1_800_000).toISOString() };
      if (this.fault.beginAmbiguous) { this.fault.beginAmbiguous = false; return { data: null, error: { code: 'timeout' } }; }
      return { data: true, error: null };
    }
    if (['promote_retryable_data_deletion', 'claim_retryable_data_deletion', 'release_retryable_data_deletion', 'list_retryable_deletion_files', 'finish_retryable_data_deletion'].includes(name) && !this.expanded) return missing();
    const valid = this.lock && this.lock.user_id === args.p_user_id && this.lock.lock_id === args.p_lock_id;
    if (name === 'promote_retryable_data_deletion') {
      if (!valid) return { data: false, error: null };
      this.lock.expires_at = IDLE;
      if (this.fault.promoteAmbiguous) { this.fault.promoteAmbiguous = false; return { data: null, error: { code: 'timeout' } }; }
      return { data: true, error: null };
    }
    if (name === 'claim_retryable_data_deletion') {
      if (!valid || this.lock.expires_at !== IDLE) return { data: null, error: null };
      const date = new Date(Date.now() + 1_800_000 + ++this.tick);
      date.setUTCFullYear(date.getUTCFullYear() + 4800);
      this.lock.expires_at = date.toISOString();
      this.lock.retry_claim = crypto.randomUUID();
      if (this.fault.claimAmbiguous) { this.fault.claimAmbiguous = false; return { data: null, error: { code: 'timeout' } }; }
      return { data: { expiry: this.lock.expires_at, token: this.lock.retry_claim }, error: null };
    }
    if (name === 'release_retryable_data_deletion') {
      if (!valid || this.lock.expires_at !== args.p_claim_until || this.lock.retry_claim !== args.p_claim_token) return { data: false, error: null };
      this.lock.expires_at = IDLE;
      this.lock.retry_claim = null;
      return { data: true, error: null };
    }
    if (name === 'list_retryable_deletion_files') {
      if (!valid || this.lock.expires_at !== args.p_claim_until || this.lock.retry_claim !== args.p_claim_token) return { data: null, error: { code: 'expired' } };
      if (this.fault.invalidListing) return { data: [{ bucket: 'speaking-recordings', path: `${OTHER}/bad.webm` }], error: null };
      const entries = [];
      for (const [bucket, paths] of this.objects) for (const path of paths) {
        if (path.split('/')[0].toLowerCase() === args.p_user_id.toLowerCase()) entries.push({ bucket, path });
      }
      entries.sort((a, b) => Buffer.compare(Buffer.from(`${a.bucket}\0${a.path}`), Buffer.from(`${b.bucket}\0${b.path}`)));
      const after = Buffer.from(`${args.p_after_bucket ?? ''}\0${args.p_after_name ?? ''}`);
      return { data: entries.filter((item) => Buffer.compare(Buffer.from(`${item.bucket}\0${item.path}`), after) > 0).slice(0, 100), error: null };
    }
    if (name === 'finish_retryable_data_deletion' || name === 'finish_week_speaking_deletion') {
      if (!valid) return { data: null, error: { code: 'expired' } };
      if (name === 'finish_retryable_data_deletion') {
        if (this.lock.expires_at !== args.p_claim_until || this.lock.retry_claim !== args.p_claim_token) return { data: null, error: { code: 'expired' } };
        for (const paths of this.objects.values()) if ([...paths].some((path) => path.split('/')[0].toLowerCase() === args.p_user_id.toLowerCase())) {
          return { data: null, error: { code: 'files-remain' } };
        }
      } else if (this.expanded && Date.parse(this.lock.expires_at) >= Date.UTC(6000, 0, 1)) {
        return { data: null, error: { code: 'durable-job' } };
      }
      this.lock = null;
      this.learningRows = 0;
      this.completed += 1;
      if (this.fault.finishAmbiguous) { this.fault.finishAmbiguous = false; return { data: null, error: { code: 'timeout' } }; }
      return { data: { deleted: true }, error: null };
    }
    if (name === 'end_week_speaking_deletion') {
      if (valid) this.lock = null;
      return { data: null, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  }
}

function route({ expanded = true, strict = false, user = USER, source = 'new', objects } = {}) {
  const admin = new FakeAdmin({ expanded, strict, objects });
  const client = { auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: null }) } };
  const file = source === 'old' ? 'tests/fixtures/delete-data-0080.route.txt' : 'src/app/api/account/delete-data/route.ts';
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, crypto, Buffer, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-secret' } }, console: { error() {} }, require(name) {
    if (name === 'node:crypto') return crypto;
    if (name === 'next/server') return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers }) } };
    if (name === '@/lib/b1b2/retryable-data-deletion.mjs') return deletion;
    if (name === '@/utils/supabase/admin') return { createAdminSupabase: () => admin };
    if (name === '@/utils/supabase/server') return { createServerSupabase: async () => client };
    throw new Error(name);
  } });
  return { admin, POST: exports.POST };
}
async function begin(f) {
  const result = await f.POST(input({ confirm: 'DELETE', phase: 'begin' }));
  assert.equal(result.status, 200);
  assert.equal(result.body.pending, true);
  return result.body.receipt;
}
const finish = (f, receipt) => f.POST(input({ confirm: 'DELETE', phase: 'finish', receipt }));

// The fixture is the exact old server route from merged PR #111; it makes the
// old-app/new-schema half a behavioral test, not a regex-only claim.
test('old 0080 app still runs against expanded schema; its orphan needs the safety net', async () => {
  assert.equal(crypto.createHash('sha256').update(readFileSync('tests/fixtures/delete-data-0080.route.txt')).digest('hex'),
    '0ff028cf9f7f4ede503601892ae5233fec8022282faf648585c01b48dc400c90');
  const f = route({ source: 'old' });
  const result = await f.POST(input({ confirm: 'DELETE' }));
  assert.equal(result.status, 200);
  assert.equal(result.body.deleted, true);
  assert.equal(f.admin.learningRows, 0);
  assert.equal(f.admin.objects.get('speaking-recordings').has(audioPath), false);
  assert.equal(f.admin.objects.get('speaking-recordings').has(orphan), true); // explicit accepted legacy gap
  assert.equal(f.admin.completed, 1);
});

test('old app failure keeps database rows and its original retry behavior during overlap', async () => {
  const f = route({ source: 'old' });
  f.admin.fault.partialStorage = true;
  assert.equal((await f.POST(input({ confirm: 'DELETE' }))).status, 503);
  assert.equal(f.admin.learningRows, 3);
  assert.equal(f.admin.lock, null); // old finite lease; not claimed to be retry-safe
  assert.equal((await f.POST(input({ confirm: 'DELETE' }))).status, 200);
  assert.equal(f.admin.learningRows, 0);
});

test('expanded schema records a durable job before removing tracked and orphaned files', async () => {
  const f = route();
  const receipt = await begin(f);
  assert.ok(f.admin.lock && Date.parse(f.admin.lock.expires_at) >= Date.UTC(6000, 0, 1));
  assert.equal(f.admin.calls.some((call) => call[0] === 'remove'), false);
  const result = await finish(f, receipt);
  assert.equal(result.status, 200);
  assert.equal(result.body.deleted, true);
  assert.equal(f.admin.learningRows, 0);
  assert.deepEqual([...f.admin.objects.get('speaking-recordings')], [`${OTHER}/other.webm`]);
  assert.deepEqual([...f.admin.objects.get('issue-attachments')], [`${OTHER}/other.png`]);
  assert.ok(f.admin.calls.filter((call) => call[0] === 'remove').every((call) => Date.parse(call[3]) >= Date.UTC(6000, 0, 1)));
  assert.ok(f.admin.calls.findIndex((call) => call[1] === 'promote_retryable_data_deletion') < f.admin.calls.findIndex((call) => call[0] === 'remove'));
});

test('fenced metadata listing removes every page including case-variant owner prefixes', async () => {
  const mixed = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
  const many = new Set(Array.from({ length: 245 }, (_, i) => `${mixed.toUpperCase()}/nested/${i}.webm`));
  many.add(`${OTHER}/other.webm`);
  const f = route({ user: mixed, objects: new Map([
    ['issue-attachments', new Set()], ['speaking-recordings', many],
  ]) });
  const receipt = await begin(f);
  assert.equal((await finish(f, receipt)).status, 200);
  assert.deepEqual([...f.admin.objects.get('speaking-recordings')], [`${OTHER}/other.webm`]);
  assert.ok(f.admin.calls.filter((call) => call[0] === 'remove').every((call) => call[2].length <= 100));
  assert.ok(f.admin.calls.filter((call) => call[1] === 'list_retryable_deletion_files').length >= 3);
});

test('partial Storage failure leaves rows and the durable job, then the same receipt retries safely', async () => {
  const f = route(); const receipt = await begin(f);
  f.admin.fault.partialStorage = true;
  const failed = await finish(f, receipt);
  assert.equal(failed.status, 503);
  assert.equal(f.admin.learningRows, 3);
  assert.equal(f.admin.lock.expires_at, IDLE);
  assert.equal(f.admin.calls.some((call) => call[1] === 'finish_retryable_data_deletion'), false);
  const retried = await finish(f, receipt);
  assert.equal(retried.status, 200);
  assert.equal(f.admin.learningRows, 0);
  assert.equal(f.admin.completed, 1);
});

test('a lost commit response and repeated signed receipt never delete later work', async () => {
  const f = route(); const receipt = await begin(f);
  f.admin.fault.finishAmbiguous = true;
  const response = await finish(f, receipt);
  assert.equal(response.status, 200);
  assert.equal(response.body.alreadyCompleted, true);
  f.admin.learningRows = 1;
  f.admin.objects.get('speaking-recordings').add(`${USER}/new-work.webm`);
  const removes = f.admin.calls.filter((call) => call[0] === 'remove').length;
  const repeated = await finish(f, receipt);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.alreadyCompleted, true);
  assert.equal(f.admin.learningRows, 1);
  assert.equal(f.admin.objects.get('speaking-recordings').has(`${USER}/new-work.webm`), true);
  assert.equal(f.admin.calls.filter((call) => call[0] === 'remove').length, removes);
});

test('concurrent retries cannot both own the same worker claim', async () => {
  const f = route(); const receipt = await begin(f);
  let unblock; let entered;
  const blocked = new Promise((resolve) => { unblock = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  f.admin.fault.storageBarrier = blocked;
  const originalRemove = f.admin.storage.from;
  f.admin.storage.from = (bucket) => {
    const client = originalRemove(bucket); const remove = client.remove;
    client.remove = async (paths) => { entered(); return remove(paths); };
    return client;
  };
  const first = finish(f, receipt);
  await started;
  const second = await finish(f, receipt);
  assert.equal(second.status, 409);
  unblock();
  assert.equal((await first).status, 200);
  assert.equal(f.admin.completed, 1);
});

test('expired worker cannot discover new files after another worker completes', async () => {
  const many = new Set(Array.from({ length: 150 }, (_, i) => `${USER}/old/${String(i).padStart(3, '0')}.png`));
  const f = route({ objects: new Map([['issue-attachments', many], ['speaking-recordings', new Set()]]) });
  const receipt = await begin(f);
  let resume; let entered;
  const blocked = new Promise((resolve) => { resume = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  const original = f.admin.rpc.bind(f.admin);
  let firstPage = true;
  f.admin.rpc = async (name, args) => {
    const result = await original(name, args);
    if (name === 'list_retryable_deletion_files' && firstPage) {
      firstPage = false;
      entered();
      await blocked;
    }
    return result;
  };
  const stalled = finish(f, receipt);
  await started;
  // Simulate the first worker's lease expiring while its page response is held.
  f.admin.lock.expires_at = IDLE;
  assert.equal((await finish(f, receipt)).status, 200);
  const fresh = `${USER}/deletion-v1/new-generation/new.png`;
  many.add(fresh);
  const removesBeforeResume = f.admin.calls.filter((call) => call[0] === 'remove').length;
  resume();
  assert.equal((await stalled).status, 503);
  assert.equal(many.has(fresh), true);
  assert.equal(f.admin.calls.filter((call) => call[0] === 'remove').length, removesBeforeResume);
});

test('a delayed Storage removal uses only the old snapshot, never newly created work', async () => {
  const f = route(); const receipt = await begin(f);
  let resume; let entered;
  const blocked = new Promise((resolve) => { resume = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  const from = f.admin.storage.from;
  let firstRemove = true;
  f.admin.storage.from = (bucket) => {
    const client = from(bucket); const remove = client.remove;
    client.remove = async (paths) => {
      if (firstRemove) { firstRemove = false; entered(); await blocked; }
      return remove(paths);
    };
    return client;
  };
  const stalled = finish(f, receipt);
  await started;
  f.admin.lock.expires_at = IDLE;
  assert.equal((await finish(f, receipt)).status, 200);
  const fresh = `${USER}/deletion-v1/new-generation/fresh.png`;
  f.admin.objects.get('issue-attachments').add(fresh);
  resume();
  await stalled;
  assert.equal(f.admin.objects.get('issue-attachments').has(fresh), true);
  assert.equal(f.admin.calls.filter((call) => call[0] === 'remove').some((call) => call[2].includes(fresh)), false);
});

test('old-schema worker rechecks its claim after a delayed Storage listing', async () => {
  const f = route({ expanded: false }); const receipt = await begin(f);
  let resume; let entered;
  const blocked = new Promise((resolve) => { resume = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  const from = f.admin.storage.from;
  let firstList = true;
  f.admin.storage.from = (bucket) => {
    const client = from(bucket); const list = client.list;
    client.list = async (...args) => {
      const result = await list(...args);
      if (firstList) { firstList = false; entered(); await blocked; }
      return result;
    };
    return client;
  };
  const stalled = finish(f, receipt);
  await started;
  f.admin.lock.expires_at = IDLE;
  assert.equal((await finish(f, receipt)).status, 200);
  const fresh = `${USER}/fresh.png`;
  f.admin.objects.get('issue-attachments').add(fresh);
  const removesBeforeResume = f.admin.calls.filter((call) => call[0] === 'remove').length;
  resume();
  assert.equal((await stalled).status, 503);
  assert.equal(f.admin.objects.get('issue-attachments').has(fresh), true);
  assert.equal(f.admin.calls.filter((call) => call[0] === 'remove').length, removesBeforeResume);
});

test('lost begin and promotion acknowledgements are recovered without touching files early', async () => {
  const f = route();
  f.admin.fault.beginAmbiguous = true;
  f.admin.fault.promoteAmbiguous = true;
  const receipt = await begin(f);
  assert.equal(f.admin.calls.some((call) => call[0] === 'remove'), false);
  assert.equal((await finish(f, receipt)).status, 200);
});

test('an ambiguous worker claim removes nothing and remains recoverable', async () => {
  const f = route(); const receipt = await begin(f);
  f.admin.fault.claimAmbiguous = true;
  assert.equal((await finish(f, receipt)).status, 503);
  assert.equal(f.admin.learningRows, 3);
  assert.equal(f.admin.calls.some((call) => call[0] === 'remove'), false);
  // Simulate the worker lease becoming reclaimable; the durable barrier stays.
  f.admin.lock.expires_at = IDLE;
  assert.equal((await finish(f, receipt)).status, 200);
});

test('invalid receipts, unauthenticated users and unavailable 0080 RPC fail before Storage', async () => {
  const f = route();
  assert.equal((await f.POST(input({ confirm: 'no', phase: 'begin' }))).status, 400);
  assert.equal((await finish(f, `${crypto.randomUUID()}.not-a-signature`)).status, 400);
  const receipt = await begin(f);
  const differentUser = route({ user: OTHER });
  assert.equal((await finish(differentUser, receipt)).status, 400);
  f.admin.lock = null;
  f.admin.fault.missingBase = true;
  assert.equal((await f.POST(input({ confirm: 'DELETE', phase: 'begin' }))).status, 503);
  assert.equal(f.admin.calls.some((call) => call[0] === 'remove'), false);
  const anonymous = route({ user: null });
  assert.equal((await anonymous.POST(input({ confirm: 'DELETE', phase: 'begin' }))).status, 401);
});

test('invalid metadata is rejected without deleting another owner', async () => {
  const f = route(); const receipt = await begin(f);
  f.admin.fault.invalidListing = true;
  assert.equal((await finish(f, receipt)).status, 503);
  assert.equal(f.admin.learningRows, 3);
  assert.equal(f.admin.objects.get('speaking-recordings').has(`${OTHER}/other.webm`), true);
});

test('new app with 0080 schema persists a job, survives partial failure and resumes the same receipt', async () => {
  const f = route({ expanded: false }); const receipt = await begin(f);
  f.admin.fault.partialStorage = true;
  assert.equal((await finish(f, receipt)).status, 503);
  assert.equal(f.admin.lock.expires_at, IDLE);
  assert.equal(f.admin.learningRows, 3);
  assert.equal((await finish(f, receipt)).status, 200);
  assert.equal(f.admin.learningRows, 0);
  assert.deepEqual(f.admin.legacyCache, []); // ownerless 0080 cache must be discarded globally
  assert.deepEqual([...f.admin.objects.get('speaking-recordings')], [`${OTHER}/other.webm`]);
  assert.ok(f.admin.calls.some((call) => call[1] === 'finish_week_speaking_deletion'));
});

test('old-schema shared-cache purge failure leaves deletion pending until a successful retry', async () => {
  const f = route({ expanded: false });
  const receipt = await begin(f);
  f.admin.fault.cachePurge = true;
  assert.equal((await finish(f, receipt)).status, 503);
  assert.equal(f.admin.learningRows, 3);
  assert.equal(f.admin.lock.expires_at, IDLE);
  assert.equal(f.admin.calls.some((call) => call[1] === 'finish_week_speaking_deletion'), false);
  assert.equal((await finish(f, receipt)).status, 200);
  assert.deepEqual(f.admin.legacyCache, []);
  assert.equal(f.admin.learningRows, 0);
});

test('legacy one-step request works in compatibility mode, and the activated fence asks old pages to refresh', async () => {
  const oldSchema = route({ expanded: false });
  assert.equal((await oldSchema.POST(input({ confirm: 'DELETE' }))).status, 200);
  const overlap = route();
  assert.equal((await overlap.POST(input({ confirm: 'DELETE' }))).status, 200);
  const strict = route({ strict: true });
  assert.equal((await strict.POST(input({ confirm: 'DELETE' }))).status, 409);
  assert.equal(strict.admin.calls.some((call) => call[0] === 'remove'), false);
  const receipt = await begin(strict);
  assert.equal((await finish(strict, receipt)).status, 200);
});
