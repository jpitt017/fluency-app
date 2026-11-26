// Isolated E2E DB integration; only confirmed, disposable example.test users are used.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { assertE2ESupabaseApiTarget } from './assert-e2e-supabase-target.mjs';
import { createTestUser, deleteTestUser } from './lib/test-user.mjs';

const { projectUrl: url, anonKey: anon, serviceRoleKey: key } = assertE2ESupabaseApiTarget();
const admin = createClient(url, key, { auth: { persistSession: false } });
const users = [];
let stage = 'create learners';
async function makeUser(prefix) {
  const user = await createTestUser(admin, prefix); users.push(user);
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (login.error) throw login.error;
  return { ...user, client };
}
async function status(client) {
  const result = await client.rpc('get_ai_usage_status');
  if (result.error) throw result.error;
  return result.data;
}
async function consume(client, units) {
  const result = await client.rpc('consume_ai_usage', { p_endpoint: '/api/writing/correct', p_units: units });
  if (result.error) throw result.error;
  return result.data;
}
try {
  const learner = await makeUser('ai-limit-learner');
  const staff = await makeUser('ai-limit-staff');
  stage = 'make teacher';
  let result = await admin.from('profiles').update({ role: 'teacher' }).eq('id', staff.id);
  if (result.error) throw result.error;
  stage = 'free status and access controls';
  let current = await status(learner.client);
  assert.equal(current.tier, 'free'); assert.equal(current.daily_units_remaining, 30);
  assert.ok((await learner.client.rpc('teacher_set_pilot', { p_user_id: learner.id, p_enabled: true })).error, 'learner cannot grant pilot');
  assert.ok((await learner.client.from('pilot_learners').insert({ user_id: learner.id })).error, 'direct grant forbidden');
  stage = 'assign pilot';
  result = await staff.client.rpc('teacher_set_pilot', { p_user_id: learner.id, p_enabled: true });
  if (result.error) throw result.error;
  current = await status(learner.client); assert.equal(current.tier, 'pilot'); assert.equal(current.daily_unit_limit, 120);
  stage = 'consume pilot';
  const used = await consume(learner.client, 2); assert.equal(used.allowed, true); assert.equal(used.daily_units_remaining, 118);
  stage = 'pro precedence';
  result = await admin.from('profiles').update({ subscription_status: 'active' }).eq('id', learner.id);
  if (result.error) throw result.error;
  current = await status(learner.client); assert.equal(current.tier, 'pro'); assert.equal(current.daily_unit_limit, 180); assert.equal(current.daily_units_remaining, 178);
  stage = 'remove pilot';
  result = await admin.from('profiles').update({ subscription_status: null }).eq('id', learner.id);
  if (result.error) throw result.error;
  result = await staff.client.rpc('teacher_set_pilot', { p_user_id: learner.id, p_enabled: false });
  if (result.error) throw result.error;
  current = await status(learner.client); assert.equal(current.tier, 'free'); assert.equal(current.daily_units_remaining, 28);
  stage = 'concurrent limit';
  const race = await Promise.all([consume(learner.client, 20), consume(learner.client, 20)]);
  assert.equal(race.filter(x => x.allowed).length, 1); assert.equal(race.filter(x => x.reason === 'daily_limit').length, 1);
  current = await status(learner.client); assert.equal(current.daily_units_remaining, 8);
  assert.equal((await consume(learner.client, 9)).reason, 'daily_limit');
  stage = 'reset';
  const before = await admin.from('ai_usage_events').select('id', { count: 'exact', head: true }).eq('user_id', learner.id);
  if (before.error) throw before.error;
  result = await admin.from('ai_usage_resets').upsert({ user_id: learner.id, reset_at: new Date().toISOString() });
  if (result.error) throw result.error;
  current = await status(learner.client); assert.equal(current.daily_units_remaining, 30);
  const after = await admin.from('ai_usage_events').select('id', { count: 'exact', head: true }).eq('user_id', learner.id);
  if (after.error) throw after.error;
  assert.equal(after.count, before.count, 'reset preserves usage logs');
  stage = 'staff';
  for (const role of ['teacher', 'admin']) {
    result = await admin.from('profiles').update({ role }).eq('id', staff.id); if (result.error) throw result.error;
    current = await status(staff.client); assert.equal(current.tier, 'staff'); assert.equal(current.daily_unit_limit, 1000);
    assert.equal((await consume(staff.client, 20)).allowed, true);
  }
  const staffEvents = await admin.from('ai_usage_events').select('id', { count: 'exact', head: true }).eq('user_id', staff.id);
  if (staffEvents.error) throw staffEvents.error;
  assert.equal(staffEvents.count, 2, 'staff usage is logged');
  console.log('AI tiers, authorization, limits, concurrent usage and reset verified.');
} catch (error) {
  const message = String(error?.message ?? error).replace(/[\r\n%]/g, ' ').slice(0, 500);
  console.log(`::error::AI limits test failed at ${stage}: ${message}`);
  throw error;
} finally {
  for (const user of users.reverse()) await deleteTestUser(admin, user.id);
}
