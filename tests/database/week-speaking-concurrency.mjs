// Integration test ONLY for the disposable local replay database. It creates
// synthetic users, exercises genuinely concurrent connections, and cleans them
// up. It never connects to a remote Supabase project.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl) throw new Error('TEST_DATABASE_URL is required for the disposable local database.');
const parsed = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
  || !['127.0.0.1', '[::1]'].includes(parsed.hostname)
  || !parsed.port || parsed.pathname !== '/postgres' || parsed.search || parsed.hash) {
  throw new Error('Refusing to run concurrent database tests against a non-local database.');
}
const clients = Array.from({ length: 3 }, () => new pg.Client({ connectionString: rawUrl }));
const [admin, a, b] = clients;
const users = Array.from({ length: 4 }, () => randomUUID());
const takeIds = Array.from({ length: 8 }, () => randomUUID());

async function reserve(client, userId, takeId) {
  const result = await client.query(
    "select public.reserve_week_speaking_take($1, 1::smallint, $2, 'first', 'webm', '[]', '[]', null) as item",
    [userId, takeId],
  );
  return result.rows[0].item;
}
async function beginDelete(client, userId, token) {
  return (await client.query('select public.begin_week_speaking_deletion($1, $2) as acquired', [userId, token])).rows[0].acquired;
}
async function waitForBlock(blocker, blocked) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const result = await admin.query('select $1::int = any(pg_blocking_pids($2::int)) as waiting', [blocker.processID, blocked.processID]);
    if (result.rows[0].waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The concurrent transaction did not wait for the expected user lock.');
}
const settled = (promise) => promise.then((value) => ({ value }), (error) => ({ error }));

try {
  await Promise.all(clients.map((client) => client.connect()));
  for (const userId of users) {
    await admin.query("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,aud,role) values ($1,$2,'{}','{}','authenticated','authenticated')",
      [userId, `speaking-concurrency-${userId}@example.test`]);
  }

  // Two parallel captures and two parallel checks may each reserve one slot,
  // never two. A check also blocks deletion while its provider may be running.
  const captures = await Promise.allSettled([reserve(a, users[0], takeIds[0]), reserve(b, users[0], takeIds[1])]);
  assert.equal(captures.filter((item) => item.status === 'fulfilled').length, 1);
  const capture = captures.find((item) => item.status === 'fulfilled').value;
  assert.equal((await admin.query('select public.finish_week_speaking_upload($1,$2,true) as ok', [users[0], capture.takeId])).rows[0].ok, true);
  const checkIds = [randomUUID(), randomUUID()];
  const check = (client, id) => client.query('select public.reserve_week_speaking_check($1,$2,$3)', [users[0], capture.takeId, id]);
  const checks = await Promise.allSettled([check(a, checkIds[0]), check(b, checkIds[1])]);
  assert.equal(checks.filter((item) => item.status === 'fulfilled').length, 1);
  const winningCheck = checkIds[checks.findIndex((item) => item.status === 'fulfilled')];
  assert.equal((await admin.query('select checks_used from public.week_speaking_flows where user_id=$1', [users[0]])).rows[0].checks_used, 1);
  assert.equal(await beginDelete(admin, users[0], randomUUID()), false);
  await admin.query("select public.finish_week_speaking_check($1,$2,'failed',null,null)", [users[0], winningCheck]);

  // Starting an upload and acquiring a deletion barrier at the same time must
  // be exclusive, regardless of which transaction gets the user lock first.
  const deleteToken = randomUUID();
  const [uploadRace, deleteRace] = await Promise.all([
    settled(reserve(a, users[1], takeIds[2])),
    beginDelete(b, users[1], deleteToken),
  ]);
  assert.ok((uploadRace.value && deleteRace === false) || (uploadRace.error && deleteRace === true));

  // First ordering: Storage starts its metadata transaction first. Deletion
  // really waits for its user lock, then sees the still-active upload. Roll
  // back the synthetic metadata; no Storage object or binary is created.
  const before = await reserve(admin, users[2], takeIds[3]);
  await a.query('begin');
  await a.query("insert into storage.objects(bucket_id,name) values ('speaking-recordings',$1)", [before.path]);
  const waitingDeletion = settled(beginDelete(b, users[2], randomUUID()));
  await waitForBlock(a, b);
  await a.query('rollback');
  assert.equal((await waitingDeletion).value, false);

  // Reverse ordering: after a stale upload, deletion holds the user lock first.
  // Its commit makes the blocked late Storage insertion fail, as must another
  // insertion after the ledger has been removed.
  const late = await reserve(admin, users[3], takeIds[4]);
  await admin.query("update public.week_speaking_flows set active_since=clock_timestamp()-interval '31 minutes' where user_id=$1", [users[3]]);
  const lateToken = randomUUID();
  await a.query('begin');
  assert.equal(await beginDelete(a, users[3], lateToken), true);
  const waitingInsert = settled(b.query("insert into storage.objects(bucket_id,name) values ('speaking-recordings',$1)", [late.path]));
  await waitForBlock(a, b);
  await a.query('commit');
  assert.match((await waitingInsert).error?.message ?? '', /no longer active/);
  assert.equal((await admin.query('select public.finish_week_speaking_upload($1,$2,true) as ok', [users[3], takeIds[4]])).rows[0].ok, false);
  const deleted = await admin.query('select public.finish_week_speaking_deletion($1,$2) as result', [users[3], lateToken]);
  assert.equal(deleted.rows[0].result.deleted, true);
  await assert.rejects(() => admin.query("insert into storage.objects(bucket_id,name) values ('speaking-recordings',$1)", [late.path]), /no longer active/);

  console.log('PASS: concurrent capture/check reservations, deletion barriers and late Storage metadata.');
} finally {
  // A local rollback releases any deliberately-held advisory lock on failure.
  for (const client of [a, b]) if (client._connected && !client._ending) await client.query('rollback').catch(() => {});
  if (admin._connected && !admin._ending) {
    await admin.query('delete from auth.users where id=any($1::uuid[])', [users]);
  }
  await Promise.all(clients.map((client) => client.end().catch(() => {})));
}
