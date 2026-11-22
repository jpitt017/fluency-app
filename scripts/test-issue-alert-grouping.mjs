// Integration test against the authorized database. No emails are sent.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from './lib/test-user.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (url !== 'https://ebzmkhrssgnzmixfsuso.supabase.co' || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Authorized production database credentials required');
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const path = `/test-alert-${randomUUID()}`;
const hash = createHash('sha256').update(path).digest('hex');
let user;
try {
  user = await createTestUser(admin, 'alert-group-test');
  const ids = Array.from({ length: 4 }, () => randomUUID());
  const { error: insertError } = await admin.from('issue_reports').insert(ids.map(id => ({ id, user_id: user.id, type: 'broken', message: 'Alert grouping test', page_url: `https://example.test${path}` })));
  if (insertError) throw insertError;
  async function claim(id, token) {
    const { data, error } = await admin.rpc('claim_issue_alert', { p_id: id, p_page_hash: hash, p_token: token });
    if (error) throw error;
    return data;
  }
  async function finish(id, token, sent) {
    const { data, error } = await admin.rpc('finish_issue_alert', { p_id: id, p_page_hash: hash, p_token: token, p_sent: sent });
    if (error) throw error;
    assert.equal(data, true);
  }
  const tokens = [randomUUID(), randomUUID()];
  const results = await Promise.all([claim(ids[0], tokens[0]), claim(ids[1], tokens[1])]);
  assert.deepEqual([...results].sort(), ['pending', 'send']);
  const winner = results.indexOf('send');
  await finish(ids[winner], tokens[winner], true);
  let { data: rows, error } = await admin.from('issue_reports').select('id,email_sent_at,email_grouped').in('id', ids.slice(0, 2));
  if (error) throw error;
  assert.equal(rows.filter(row => row.email_sent_at && !row.email_grouped).length, 1);
  assert.equal(rows.filter(row => row.email_sent_at && row.email_grouped).length, 1);
  assert.equal(await claim(ids[2], randomUUID()), 'grouped');
  const page = await admin.from('issue_alert_pages').select('last_sent_at').eq('page_hash', hash).single();
  if (page.error) throw page.error;
  assert.equal(await claim(ids[2], randomUUID()), 'done');
  const reset = await admin.from('issue_alert_pages').update({ last_sent_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq('page_hash', hash);
  if (reset.error) throw reset.error;
  const retryToken = randomUUID();
  assert.equal(await claim(ids[3], retryToken), 'send');
  await finish(ids[3], retryToken, false);
  assert.equal(await claim(ids[3], randomUUID()), 'send', 'failed send releases the lease');
  console.log('Concurrent claims, grouping, retry and expiry verified.');
} finally {
  if (user) await deleteTestUser(admin, user.id);
  const { error } = await admin.from('issue_alert_pages').delete().eq('page_hash', hash);
  if (error) throw error;
}
