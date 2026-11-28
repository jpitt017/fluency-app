// Disposable local PostgreSQL only: real concurrent advisory locks and
// synthetic Storage metadata, no learner audio or remote project access.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';

const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl) throw new Error('TEST_DATABASE_URL is required for a disposable local database');
const url = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname)
  || !url.port || url.pathname !== '/postgres' || url.search || url.hash) {
  throw new Error('Refusing to run deletion concurrency tests against a non-local database');
}
const clients = Array.from({ length: 3 }, () => new pg.Client({ connectionString: rawUrl }));
const [admin, a, b] = clients;
const users = Array.from({ length: 10 }, () => randomUUID());
const staff = randomUUID();
const jobs = users.map(() => randomUUID());
const alertHashes = Array.from({ length: 2 }, () => createHash('sha256').update(randomUUID()).digest('hex'));
const settled = (promise) => promise.then((value) => ({ value }), (error) => ({ error }));
async function waitForBlock(blocker, blocked) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    if ((await admin.query('select $1::int = any(pg_blocking_pids($2::int)) as waiting', [blocker.processID, blocked.processID])).rows[0].waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Expected the concurrent database transaction to wait');
}
async function begin(client, user, token) {
  return (await client.query('select public.begin_week_speaking_deletion($1,$2) as ok', [user, token])).rows[0].ok;
}
async function promote(client, user, token) {
  return (await client.query('select public.promote_retryable_data_deletion($1,$2) as ok', [user, token])).rows[0].ok;
}
async function claim(client, user, token) {
  return (await client.query('select public.claim_retryable_data_deletion($1,$2) as claim', [user, token])).rows[0].claim;
}

try {
  await Promise.all(clients.map((client) => client.connect()));
  // Concurrent database-issued IDs stay unique without any per-user history.
  const allocations = await Promise.all([a, b].map((client) => client.query(
    'select public.allocate_recording_key() as id from generate_series(1, 100)',
  )));
  const ids = allocations.flatMap((result) => result.rows.map((row) => row.id));
  assert.equal(new Set(ids).size, 200);
  assert.ok(ids.every((id) => /^f[0-9a-f]{7}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));

  // The 0080 compatibility allocator consumes this existing identity via
  // ownerless temporary log rows. Concurrent inserts and rolled-back rows
  // must still consume distinct sequence values, with no retained fixture.
  const oldBatches = await Promise.all([a, b].map(async (client) => {
    await client.query('begin');
    const rows = (await client.query(`insert into public.ai_request_logs(user_id,endpoint,model,status_code,latency_ms)
      select null,'/internal/recording-key-allocation','internal',204,0 from generate_series(1,100) returning id::text`)).rows;
    await client.query('rollback');
    return rows.map((row) => row.id);
  }));
  const oldIds = oldBatches.flat();
  assert.equal(new Set(oldIds).size, 200);
  const laterOld = await admin.query(`insert into public.ai_request_logs(user_id,endpoint,model,status_code,latency_ms)
    values(null,'/internal/recording-key-allocation','internal',204,0) returning id::text`);
  assert.ok(!oldIds.includes(laterOld.rows[0].id));
  await admin.query('delete from public.ai_request_logs where id=$1::bigint', [laterOld.rows[0].id]);
  for (const u of [...users, staff]) await admin.query("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,aud,role) values ($1,$2,'{}','{}','authenticated','authenticated')", [u, `delete-race-${u}@example.test`]);
  await admin.query("update public.profiles set role='teacher' where id=$1", [staff]);
  const generations = (await admin.query('select id,data_deletion_generation from public.profiles where id=any($1::uuid[])', [users])).rows;
  const gen = (u) => generations.find((row) => row.id === u).data_deletion_generation;
  const path0 = `${users[0]}/deletion-v1/${gen(users[0])}/pending.png`;

  // Deletion holds the user lock first: a truly concurrent metadata write
  // waits, then fails as soon as the durable job is visible.
  await a.query('begin');
  assert.equal(await begin(a, users[0], jobs[0]), true);
  assert.equal(await promote(a, users[0], jobs[0]), true);
  const pendingUpload = settled(b.query("insert into storage.objects(bucket_id,name) values ('issue-attachments',$1)", [path0]));
  await waitForBlock(a, b);
  await a.query('commit');
  assert.match((await pendingUpload).error?.message ?? '', /deletion is pending/i);
  const claims = await Promise.all([claim(a, users[0], jobs[0]), claim(b, users[0], jobs[0])]);
  assert.equal(claims.filter(Boolean).length, 1);

  // The upload commits first: deletion must wait, then enumerate its metadata
  // before finalizing. A mere reference-table scan would miss this object.
  const path1 = `${users[1]}/deletion-v1/${gen(users[1])}/before.png`;
  await b.query('begin');
  await b.query("insert into storage.objects(bucket_id,name) values ('issue-attachments',$1)", [path1]);
  await a.query('begin');
  const waitingDelete = settled(begin(a, users[1], jobs[1]));
  await waitForBlock(b, a);
  await b.query('commit');
  assert.equal((await waitingDelete).value, true);
  assert.equal(await promote(a, users[1], jobs[1]), true);
  await a.query('commit');
  const lease1 = await claim(a, users[1], jobs[1]);
  const list = await admin.query('select public.list_retryable_deletion_files($1,$2,$3,$4) as files', [users[1], jobs[1], lease1.expiry, lease1.token]);
  assert.deepEqual(list.rows[0].files.map((item) => item.path), [path1]);
  await assert.rejects(() => admin.query('select public.finish_retryable_data_deletion($1,$2,$3,$4)', [users[1], jobs[1], lease1.expiry, lease1.token]), /files are still present/);
  await admin.query("select set_config('storage.allow_delete_query','true',false)");
  await admin.query("delete from storage.objects where bucket_id='issue-attachments' and name=$1", [path1]);
  assert.equal((await admin.query('select public.finish_retryable_data_deletion($1,$2,$3,$4) as result', [users[1], jobs[1], lease1.expiry, lease1.token])).rows[0].result.deleted, true);

  // A request which began before the delete cannot finish its new-generation
  // upload afterwards. Untagged old instances may still arrive in the overlap,
  // but the daily list finds them; after activation they are rejected too.
  await assert.rejects(() => admin.query("insert into storage.objects(bucket_id,name) values ('issue-attachments',$1)", [path1]), /began before data deletion/);
  const lateLegacy = `${users[1]}/legacy-late.png`;
  await admin.query("insert into storage.objects(bucket_id,name) values ('issue-attachments',$1)", [lateLegacy]);
  const late = await admin.query("select object_name from public.list_late_deletion_files('', '', 100, $1)", [users[1]]);
  assert.ok(late.rows.some((row) => row.object_name === lateLegacy));
  await admin.query("delete from storage.objects where bucket_id='issue-attachments' and name=$1", [lateLegacy]);
  await admin.query('update public.data_deletion_safety_config set enforce_legacy_fence=true where singleton');
  // Storage's service client carries service_role at both checks.
  await admin.query("select set_config('request.jwt.claim.role','service_role',false), set_config('request.jwt.claims','{\"role\":\"service_role\"}',false), set_config('request.method','POST',false), set_config('request.path','/object/issue-attachments/synthetic',false)");
  await assert.rejects(() => admin.query("insert into storage.objects(bucket_id,name) values ('issue-attachments',$1)", [lateLegacy]), /legacy upload/i);
  const current = (await admin.query('select data_deletion_generation from public.profiles where id=$1', [users[1]])).rows[0].data_deletion_generation;
  const newPath = `${users[1]}/deletion-v1/${current}/fresh.png`;
  await admin.query("insert into storage.objects(bucket_id,name,user_metadata) values ('issue-attachments',$1,'{\"data_deletion_client\":\"v1\"}'::jsonb)", [newPath]);
  assert.equal((await admin.query("select count(*)::int as n from public.list_late_deletion_files('', '', 100, $1) where object_name=$2", [users[1], newPath])).rows[0].n, 0);

  // A dead worker's claim is reclaimable, but the job and write barrier do not
  // expire. The stale worker cannot release or finalize the newer claim.
  assert.equal(await begin(admin, users[2], jobs[2]), true);
  assert.equal(await promote(admin, users[2], jobs[2]), true);
  const old = await claim(a, users[2], jobs[2]);
  await admin.query("update public.week_speaking_deletion_locks set expires_at=clock_timestamp()+interval '4800 years'-interval '1 minute' where user_id=$1", [users[2]]);
  const replacement = await claim(b, users[2], jobs[2]);
  assert.ok(replacement && replacement.token !== old.token);
  assert.equal((await admin.query('select public.release_retryable_data_deletion($1,$2,$3,$4) as ok', [users[2], jobs[2], old.expiry, old.token])).rows[0].ok, false);
  await assert.rejects(() => admin.query('select public.finish_retryable_data_deletion($1,$2,$3,$4)', [users[2], jobs[2], old.expiry, old.token]), /worker expired/i);
  assert.equal((await admin.query('select public.finish_retryable_data_deletion($1,$2,$3,$4) as result', [users[2], jobs[2], replacement.expiry, replacement.token])).rows[0].result.deleted, true);

  // Cache write first: its owner advisory lock makes deletion wait. Once it
  // commits, deletion must erase the cached learner-derived feedback as well.
  await b.query('begin');
  await b.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.headers',$2,true)",
    [users[3], JSON.stringify({ 'x-fluency-data-generation': gen(users[3]) })]);
  await b.query("select public.set_owned_ai_eval_cache('concurrent','writing','test','{\"feedback\":\"before delete\"}'::jsonb)");
  await a.query('begin');
  const cacheFirstDelete = settled(begin(a, users[3], jobs[3]));
  await waitForBlock(b, a);
  await b.query('commit');
  assert.equal((await cacheFirstDelete).value, true);
  assert.equal(await promote(a, users[3], jobs[3]), true);
  await a.query('commit');
  const cacheFirstClaim = await claim(a, users[3], jobs[3]);
  assert.equal((await admin.query('select public.finish_retryable_data_deletion($1,$2,$3,$4) as result',
    [users[3], jobs[3], cacheFirstClaim.expiry, cacheFirstClaim.token])).rows[0].result.deleted, true);
  assert.equal((await admin.query('select count(*)::int as n from public.ai_evaluation_cache where cache_owner_id=$1', [users[3]])).rows[0].n, 0);

  // Deletion first: an already-started evaluation waits behind the owner lock,
  // then must reject its old generation rather than repopulating the cache.
  await a.query('begin');
  assert.equal(await begin(a, users[4], jobs[4]), true);
  assert.equal(await promote(a, users[4], jobs[4]), true);
  const cacheLastClaim = await claim(a, users[4], jobs[4]);
  assert.equal((await a.query('select public.finish_retryable_data_deletion($1,$2,$3,$4) as result',
    [users[4], jobs[4], cacheLastClaim.expiry, cacheLastClaim.token])).rows[0].result.deleted, true);
  await b.query('begin');
  await b.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.headers',$2,true)",
    [users[4], JSON.stringify({ 'x-fluency-data-generation': gen(users[4]) })]);
  const lateCache = settled(b.query("select public.set_owned_ai_eval_cache('concurrent','writing','test','{\"feedback\":\"late response\"}'::jsonb)"));
  await waitForBlock(a, b);
  await a.query('commit');
  assert.match((await lateCache).error?.message ?? '', /request began before data deletion/i);
  await b.query('rollback');
  assert.equal((await admin.query('select count(*)::int as n from public.ai_evaluation_cache where cache_owner_id=$1', [users[4]])).rows[0].n, 0);

  // Staff write first: the deletion waits for the teacher transaction and then
  // erases the pilot assignment. The target epoch is not the teacher's epoch.
  await b.query('begin');
  await b.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.headers',$2,true)",
    [staff, JSON.stringify({ 'x-fluency-target-generation': gen(users[5]) })]);
  await b.query('select public.teacher_set_pilot($1,true)', [users[5]]);
  await a.query('begin');
  const pilotFirstDelete = settled(begin(a, users[5], jobs[5]));
  await waitForBlock(b, a);
  await b.query('commit');
  assert.equal((await pilotFirstDelete).value, true);
  assert.equal(await promote(a, users[5], jobs[5]), true);
  const pilotFirstClaim = await claim(a, users[5], jobs[5]);
  assert.equal((await a.query('select public.finish_retryable_data_deletion($1,$2,$3,$4) as result',
    [users[5], jobs[5], pilotFirstClaim.expiry, pilotFirstClaim.token])).rows[0].result.deleted, true);
  await a.query('commit');
  assert.equal((await admin.query('select count(*)::int as n from public.pilot_learners where user_id=$1', [users[5]])).rows[0].n, 0);

  // Deletion first: an old teacher-page assignment waits, then cannot recreate
  // that owner's pilot row after the deletion commit rotates the generation.
  await a.query('begin');
  assert.equal(await begin(a, users[6], jobs[6]), true);
  assert.equal(await promote(a, users[6], jobs[6]), true);
  const pilotLastClaim = await claim(a, users[6], jobs[6]);
  assert.equal((await a.query('select public.finish_retryable_data_deletion($1,$2,$3,$4) as result',
    [users[6], jobs[6], pilotLastClaim.expiry, pilotLastClaim.token])).rows[0].result.deleted, true);
  await b.query('begin');
  await b.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.headers',$2,true)",
    [staff, JSON.stringify({ 'x-fluency-target-generation': gen(users[6]) })]);
  const latePilot = settled(b.query('select public.teacher_set_pilot($1,true)', [users[6]]));
  await waitForBlock(a, b);
  await a.query('commit');
  assert.match((await latePilot).error?.message ?? '', /refresh the roster/i);
  await b.query('rollback');
  assert.equal((await admin.query('select count(*)::int as n from public.pilot_learners where user_id=$1', [users[6]])).rows[0].n, 0);

  // Grouped alerts span owners. The service client can carry the reporting
  // learner's actor header, so prepare each group exactly as the app does.
  // Finishing it may annotate existing reports but may never recreate a row.
  async function prepareAlert(owner, other, hash) {
    const ids = [randomUUID(), randomUUID()];
    const token = randomUUID();
    await admin.query(`insert into public.issue_reports(id,user_id,type,message,page_url,data_deletion_generation) values
      ($1,$2,'broken','other owner','https://example.test/page',$5),
      ($3,$4,'broken','deleting owner','https://example.test/page',$6)`, [ids[0], other, ids[1], owner, gen(other), gen(owner)]);
    await admin.query("select set_config('request.jwt.claim.role','service_role',false), set_config('request.jwt.claims','{\"role\":\"service_role\"}',false), set_config('request.headers',$1,false)",
      [JSON.stringify({ 'x-fluency-data-owner': other })]);
    assert.equal((await admin.query('select public.claim_issue_alert($1,$2,$3) as result', [ids[0], hash, token])).rows[0].result, 'send');
    assert.equal((await admin.query('select public.claim_issue_alert($1,$2,$3) as result', [ids[1], hash, randomUUID()])).rows[0].result, 'pending');
    return { ids, token };
  }
  async function finishAlert(client, group, hash, other) {
    await client.query('begin');
    await client.query("set local statement_timeout = '3s'");
    await client.query("select set_config('request.jwt.claim.role','service_role',true), set_config('request.jwt.claims','{\"role\":\"service_role\"}',true), set_config('request.headers',$1,true)",
      [JSON.stringify({ 'x-fluency-data-owner': other })]);
    assert.equal((await client.query('select public.finish_issue_alert($1,$2,$3,true) as ok', [group.ids[0], hash, group.token])).rows[0].ok, true);
  }
  async function assertAlertResult(group) {
    const reports = await admin.query('select id,message,email_sent_at from public.issue_reports where id=any($1::uuid[])', [group.ids]);
    assert.equal(reports.rows.length, 1, 'only the other owner’s report must survive');
    assert.equal(reports.rows[0].id, group.ids[0]);
    assert.equal(reports.rows[0].message, 'other owner');
    assert.ok(reports.rows[0].email_sent_at);
  }

  // Deletion owns its advisory lock first. A page-wide alert must still finish
  // immediately for both existing rows rather than wait on that owner.
  const alertDeleteFirst = await prepareAlert(users[7], users[9], alertHashes[0]);
  await a.query('begin');
  assert.equal(await begin(a, users[7], jobs[7]), true);
  assert.equal(await promote(a, users[7], jobs[7]), true);
  await finishAlert(b, alertDeleteFirst, alertHashes[0], users[9]);
  await b.query('commit');
  const alertClaim1 = await claim(a, users[7], jobs[7]);
  assert.equal((await a.query('select public.finish_retryable_data_deletion($1,$2,$3,$4) as result',
    [users[7], jobs[7], alertClaim1.expiry, alertClaim1.token])).rows[0].result.deleted, true);
  await a.query('commit');
  await assertAlertResult(alertDeleteFirst);

  // Alert holds the report-row locks first. Deletion can take its owner lock,
  // wait for the alert transaction, then delete only its own report: no lock
  // inversion or page-wide rollback affects the other owner's alert.
  const alertUpdateFirst = await prepareAlert(users[8], users[9], alertHashes[1]);
  await finishAlert(b, alertUpdateFirst, alertHashes[1], users[9]);
  await a.query('begin');
  await a.query("set local statement_timeout = '3s'");
  assert.equal(await begin(a, users[8], jobs[8]), true);
  assert.equal(await promote(a, users[8], jobs[8]), true);
  const alertClaim2 = await claim(a, users[8], jobs[8]);
  const waitingAlertDelete = settled(a.query('select public.finish_retryable_data_deletion($1,$2,$3,$4) as result',
    [users[8], jobs[8], alertClaim2.expiry, alertClaim2.token]));
  await waitForBlock(b, a);
  await b.query('commit');
  assert.equal((await waitingAlertDelete).value?.rows[0].result.deleted, true);
  await a.query('commit');
  await assertAlertResult(alertUpdateFirst);
  console.log('PASS: concurrent deletion/upload, cache, teacher and grouped-alert orderings, stale workers, generation fences and late-file candidates.');
} finally {
  for (const client of [a, b]) if (client._connected && !client._ending) await client.query('rollback').catch(() => {});
  if (admin._connected && !admin._ending) {
    await admin.query('update public.data_deletion_safety_config set enforce_legacy_fence=false where singleton').catch(() => {});
    await admin.query("select set_config('storage.allow_delete_query','true',false)").catch(() => {});
    await admin.query("delete from storage.objects where split_part(name,'/',1)=any($1::text[])", [users]).catch(() => {});
    await admin.query('delete from public.week_speaking_deletion_locks where user_id=any($1::uuid[])', [users]).catch(() => {});
    await admin.query('delete from auth.users where id=any($1::uuid[])', [[...users, staff]]);
    await admin.query('delete from public.issue_alert_pages where page_hash=any($1::text[])', [alertHashes]);
  }
  await Promise.all(clients.map((client) => client.end().catch(() => {})));
}
