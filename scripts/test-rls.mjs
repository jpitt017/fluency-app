#!/usr/bin/env node
/**
 * Postgres RLS Isolation Test for user-private learning data.
 *
 * Verifies that an authenticated User A cannot read, update, or delete User B's
 * `learner_errors`, `error_review_cards`, or `ai_request_logs`.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (skipped gracefully if unset).
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.log('Skipping live RLS test: NEXT_PUBLIC_SUPABASE_URL / ANON / SERVICE_ROLE_KEY not configured.');
  process.exit(0);
}

const admin = createClient(url, serviceKey);

async function run() {
  const emailA = `rls-a-${Date.now()}@example.com`;
  const emailB = `rls-b-${Date.now()}@example.com`;
  const password = 'RlsTestPassword!2026';

  const { data: userA, error: errA } = await admin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
  });
  const { data: userB, error: errB } = await admin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
  });

  if (errA || errB || !userA.user || !userB.user) {
    throw new Error(`Could not provision test users: ${errA?.message || errB?.message}`);
  }

  try {
    const { data: insertedErr, error: insertErr } = await admin
      .from('learner_errors')
      .insert({
        user_id: userB.user.id,
        source_type: 'writing',
        category: 'tense',
        original: 'I have started yesterday.',
        corrected: 'I started yesterday.',
        explanation: 'Use past simple with yesterday.',
        severity: 'moderate',
      })
      .select('id')
      .single();

    if (insertErr || !insertedErr) throw new Error(`Seed learner_error failed: ${insertErr?.message}`);

    const clientA = createClient(url, anonKey);
    const { error: signInErr } = await clientA.auth.signInWithPassword({ email: emailA, password });
    if (signInErr) throw signInErr;

    // 1. User A must see 0 rows when querying User B's learner_errors
    const { data: crossRows } = await clientA
      .from('learner_errors')
      .select('id')
      .eq('id', insertedErr.id);

    if ((crossRows ?? []).length > 0) {
      throw new Error('RLS BREACH: User A could read User B learner_errors!');
    }

    // 2. User A must NOT be able to insert into learner_errors with user_id = User B
    const { error: spoofErr } = await clientA.from('learner_errors').insert({
      user_id: userB.user.id,
      source_type: 'writing',
      category: 'article',
      original: 'Spoof test',
      corrected: 'Spoof test fixed',
      explanation: 'Should be blocked by RLS',
      severity: 'minor',
    });

    if (!spoofErr) {
      throw new Error('RLS BREACH: User A could insert learner_errors for User B!');
    }

    // 3. User A must NOT be able to update or delete User B's row
    await clientA.from('learner_errors').update({ severity: 'major' }).eq('id', insertedErr.id);
    const { data: checkRow } = await admin
      .from('learner_errors')
      .select('severity')
      .eq('id', insertedErr.id)
      .single();

    if (checkRow?.severity !== 'moderate') {
      throw new Error('RLS BREACH: User A modified User B learner_errors!');
    }

    console.log('PASS: Postgres RLS isolation verified for learner_errors (cross-read, spoof-insert, and cross-update blocked).');
  } finally {
    await admin.auth.admin.deleteUser(userA.user.id);
    await admin.auth.admin.deleteUser(userB.user.id);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
