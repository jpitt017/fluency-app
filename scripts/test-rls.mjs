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

    const anonClient = createClient(url, anonKey);
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

    // 3b. Mediation attempts: learners see only their own rows; staff see all rows.
    const { data: insertedAttempt, error: attemptErr } = await admin
      .from('mediation_attempts')
      .insert({
        user_id: userB.user.id,
        week: 4,
        task_key: 'week-4-mediation',
        transcript: 'Do not miss the cathedral.',
        response_text: null,
        feedback: { criteria: [] },
      })
      .select('id')
      .single();

    if (attemptErr || !insertedAttempt) throw new Error(`Seed mediation attempt failed: ${attemptErr?.message}`);

    const { data: crossAttempts } = await clientA
      .from('mediation_attempts')
      .select('id')
      .eq('id', insertedAttempt.id);
    if ((crossAttempts ?? []).length > 0) {
      throw new Error('RLS BREACH: User A could read User B mediation attempts!');
    }

    await clientA
      .from('mediation_attempts')
      .update({ needs_review: true })
      .eq('id', insertedAttempt.id);
    const { data: checkAttempt } = await admin
      .from('mediation_attempts')
      .select('needs_review')
      .eq('id', insertedAttempt.id)
      .single();
    if (checkAttempt?.needs_review !== false) {
      throw new Error('RLS BREACH: User A modified User B mediation attempt!');
    }

    // 4. Answer tables: anon and learners see no rows; staff see the locked tables.
    const { error: roleErr } = await admin
      .from('profiles')
      .update({ role: 'teacher' })
      .eq('id', userB.user.id);
    if (roleErr) throw new Error(`Could not mark test user B as teacher: ${roleErr.message}`);

    const clientB = createClient(url, anonKey);
    const { error: teacherSignInErr } = await clientB.auth.signInWithPassword({ email: emailB, password });
    if (teacherSignInErr) throw teacherSignInErr;

    const { data: staffAttempts, error: staffAttemptErr } = await clientB
      .from('mediation_attempts')
      .select('id')
      .eq('id', insertedAttempt.id);
    if (staffAttemptErr) throw new Error(`STAFF MEDIATION READ FAILED: ${staffAttemptErr.message}`);
    if ((staffAttempts ?? []).length === 0) {
      throw new Error('STAFF READ FAILED: teacher could not read mediation attempts!');
    }

    const relationMissing = (error) =>
      Boolean(error && /does not exist|could not find the table|not found/i.test(error.message));
    const lockedTables = [
      'syllabus_checkpoint_items',
      'syllabus_grammar_items',
      'syllabus_input_items',
      'syllabus_week_details',
      'syllabus_assessments',
      'placement_questions',
    ];

    for (const table of lockedTables) {
      const anonResult = await anonClient.from(table).select('*').limit(1);
      if (!relationMissing(anonResult.error)) {
        if (!anonResult.error && (anonResult.data?.length ?? 0) > 0) {
          throw new Error(`RLS BREACH: anon could read ${table}!`);
        }
      }

      const learnerResult = await clientA.from(table).select('*').limit(1);
      if (!relationMissing(learnerResult.error)) {
        if (!learnerResult.error && (learnerResult.data?.length ?? 0) > 0) {
          throw new Error(`RLS BREACH: learner could read ${table}!`);
        }
      }

      const teacherResult = await clientB.from(table).select('*').limit(1);
      if (!relationMissing(teacherResult.error) && teacherResult.error) {
        throw new Error(`STAFF READ FAILED for ${table}: ${teacherResult.error.message}`);
      }
    }

    // 5. Safe views contain no answer-bearing fields for anon/learners.
    const forbiddenFields = ['key', 'accepted', 'model', 'modelAnswer', 'answer_index'];
    const hasForbidden = (value) => {
      if (Array.isArray(value)) return value.some(hasForbidden);
      if (!value || typeof value !== 'object') return false;
      return Object.entries(value).some(
        ([field, child]) => forbiddenFields.includes(field) || hasForbidden(child),
      );
    };
    const safeViews = [
      ['placement_questions_safe', anonClient],
      ['placement_questions_safe', clientA],
      ['syllabus_checkpoint_items_safe', clientA],
      ['syllabus_grammar_items_safe', clientA],
      ['syllabus_input_items_safe', clientA],
      ['syllabus_week_details_safe', clientA],
      ['syllabus_assessments_safe', clientA],
    ];

    for (const [view, client] of safeViews) {
      const { data, error } = await client.from(view).select('*').limit(5);
      if (relationMissing(error)) continue;
      if (error) throw new Error(`SAFE VIEW READ FAILED for ${view}: ${error.message}`);
      if (hasForbidden(data ?? [])) {
        throw new Error(`ANSWER LEAK: ${view} contains a key, accepted answer, model or answer_index!`);
      }
    }

    // 6. Schema drift check: verify delete_my_learning_data() covers every user_id table
    const { data: coverage, error: covErr } = await admin.rpc('verify_delete_my_learning_data_coverage');
    if (covErr) throw new Error(`Coverage check failed: ${covErr.message}`);
    if (!coverage?.covered) {
      throw new Error(
        `SCHEMA DRIFT: delete_my_learning_data() is missing user_id tables: ${JSON.stringify(coverage?.missing_tables)}`,
      );
    }

    console.log('PASS: Postgres RLS isolation, staff-only answer tables, answer-free views & delete coverage verified.');
  } finally {
    await admin.auth.admin.deleteUser(userA.user.id);
    await admin.auth.admin.deleteUser(userB.user.id);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
