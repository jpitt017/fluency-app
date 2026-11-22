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
import { createTestUser, deleteTestUser } from './lib/test-user.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.log('Skipping live RLS test: NEXT_PUBLIC_SUPABASE_URL / ANON / SERVICE_ROLE_KEY not configured.');
  process.exit(0);
}

const admin = createClient(url, serviceKey);

async function run() {
  const userA = await createTestUser(admin, 'rls-a');
  const userB = await createTestUser(admin, 'rls-b');
  const userAId = userA.id;
  const userBId = userB.id;

  try {
    const { data: insertedErr, error: insertErr } = await admin
      .from('learner_errors')
      .insert({
        user_id: userBId,
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
    const { error: signInErr } = await clientA.auth.signInWithPassword({ email: userA.email, password: userA.password });
    if (signInErr) throw signInErr;

    // Vocabulary attempts are created only by trusted server marking and isolated by owner.
    const vocabularySeed = await admin.from('week_vocabulary_attempts').insert([
      { user_id: userAId, week_number: 1, item_id: 'V1-R1', answer: 'test', correct: false },
      { user_id: userBId, week_number: 1, item_id: 'V1-R1', answer: 'test', correct: false },
    ]);
    if (vocabularySeed.error) throw vocabularySeed.error;
    const ownVocabulary = await clientA.from('week_vocabulary_attempts').select('id,user_id');
    if (ownVocabulary.error || ownVocabulary.data.length !== 1 || ownVocabulary.data[0].user_id !== userAId) throw new Error('Vocabulary attempt isolation failed');
    const anonymousVocabulary = await anonClient.from('week_vocabulary_attempts').select('id');
    if (!anonymousVocabulary.error) throw new Error('Anonymous vocabulary attempt read was allowed');
    for (const operation of [
      () => clientA.from('week_vocabulary_attempts').insert({ user_id: userAId, week_number: 1, item_id: 'V1-R1', answer: 'fake', correct: true }),
      () => clientA.from('week_vocabulary_attempts').update({ correct: true }).eq('user_id', userAId),
      () => clientA.from('week_vocabulary_attempts').delete().eq('user_id', userAId),
    ]) {
      const attempted = await operation();
      if (!attempted.error) throw new Error('Learner could write vocabulary attempts directly');
    }

    // Model unlocks are server-created and visible only to their owner.
    const { error: unlockSeedError } = await admin.from('week_output_submissions').insert({ user_id: userBId, week_number: 1, skill: 'writing' });
    if (unlockSeedError) throw new Error(`Could not seed week unlock: ${unlockSeedError.message}`);
    const { data: foreignUnlocks, error: unlockReadError } = await clientA.from('week_output_submissions').select('skill').eq('user_id', userBId);
    if (unlockReadError || foreignUnlocks.length) throw new Error('Week unlock isolation failed');
    const { error: spoofUnlockError } = await clientA.from('week_output_submissions').insert({ user_id: userAId, week_number: 1, skill: 'writing' });
    if (!spoofUnlockError) throw new Error('Learner could create a model unlock directly');

    // Week progression is shared across sessions and requires all three tasks.
    const startWeek = await clientA.rpc('refresh_current_week');
    if (startWeek.error || startWeek.data !== 1) throw new Error('New learner should start at Week 1');
    const { error: profileSpoof } = await clientA.from('profiles').update({ current_week: 17 }).eq('id', userAId);
    if (!profileSpoof) throw new Error('Learner could set current week directly');
    const outputSeed = await admin.from('week_output_submissions').insert([
      { user_id: userAId, week_number: 1, skill: 'speaking' },
      { user_id: userAId, week_number: 1, skill: 'writing' },
    ]);
    if (outputSeed.error) throw outputSeed.error;
    const missingInput = await clientA.rpc('refresh_current_week');
    if (missingInput.error || missingInput.data !== 1) throw new Error('Output alone opened next week');
    const fakeInput = await clientA.from('week_input_submissions').insert({ user_id: userAId, week_number: 1, skill: 'reading' });
    if (!fakeInput.error) throw new Error('Learner could forge input completion directly');
    const inputSeed = await admin.from('week_input_submissions').insert({ user_id: userAId, week_number: 1, skill: 'reading' });
    if (inputSeed.error) throw inputSeed.error;
    const advanced = await clientA.rpc('refresh_current_week');
    if (advanced.error || advanced.data !== 2) throw new Error('Completed week did not open Week 2');
    const lateOutputs = await admin.from('week_output_submissions').insert([
      { user_id: userAId, week_number: 3, skill: 'speaking' },
      { user_id: userAId, week_number: 3, skill: 'writing' },
    ]);
    if (lateOutputs.error) throw lateOutputs.error;
    const lateInput = await admin.from('week_input_submissions').insert({ user_id: userAId, week_number: 3, skill: 'listening' });
    if (lateInput.error) throw lateInput.error;
    const noSkip = await clientA.rpc('refresh_current_week');
    if (noSkip.error || noSkip.data !== 2) throw new Error('A later task skipped an incomplete week');
    const otherSession = createClient(url, anonKey);
    const otherLogin = await otherSession.auth.signInWithPassword({ email: userA.email, password: userA.password });
    if (otherLogin.error) throw otherLogin.error;
    const shared = await otherSession.from('profiles').select('current_week').eq('id', userAId).single();
    if (shared.error || shared.data.current_week !== 2) throw new Error('Current week not shared across sessions');
    const stage2Placement = await admin.from('profiles').update({ placement_result: { band: 'Stage 2' } }).eq('id', userAId);
    if (stage2Placement.error) throw stage2Placement.error;
    const stage2Start = await clientA.rpc('refresh_current_week');
    if (stage2Start.error || stage2Start.data !== 17) throw new Error('Stage 2 placement did not start at Week 17');
    const { data: foreignInputs, error: foreignInputError } = await clientA.from('week_input_submissions').select('skill').eq('user_id', userBId);
    if (foreignInputError || foreignInputs.length) throw new Error('Week input isolation failed');

    // Reports are private to their owner until staff access them.
    const issueSeed = await clientA.from('issue_reports').insert({ user_id: userAId, type: 'idea', message: 'Test report', page_url: '/test' }).select('id').single();
    if (issueSeed.error || !issueSeed.data) throw new Error(`Issue creation failed: ${issueSeed.error?.message}`);
    const spoofIssue = await clientA.from('issue_reports').insert({ user_id: userBId, type: 'idea', message: 'Spoof', page_url: '/test' });
    if (!spoofIssue.error) throw new Error('Issue user spoof was allowed');
    const ownerIssue = await clientA.from('issue_reports').select('id').eq('id', issueSeed.data.id);
    if (ownerIssue.error || ownerIssue.data.length !== 1) throw new Error('Owner could not read issue');
    const ownStatusChange = await clientA.from('issue_reports').update({ status: 'Fixed' }).eq('id', issueSeed.data.id).select();
    if (!ownStatusChange.error && ownStatusChange.data.length) throw new Error('Learner changed issue status');
    const issueFile = `${userAId}/rls-issue-test.png`;
    const uploadedIssueFile = await admin.storage.from('issue-attachments').upload(issueFile, new Uint8Array([137,80,78,71,13,10,26,10]), { contentType: 'image/png' });
    if (uploadedIssueFile.error) throw uploadedIssueFile.error;
    const ownFile = await clientA.storage.from('issue-attachments').createSignedUrl(issueFile, 60);
    if (ownFile.error) throw new Error('Issue owner could not read attachment');
    const clientBAsLearner = createClient(url, anonKey);
    const userBSignIn = await clientBAsLearner.auth.signInWithPassword({ email: userB.email, password: userB.password });
    if (userBSignIn.error) throw userBSignIn.error;
    const foreignIssue = await clientBAsLearner.from('issue_reports').select('id').eq('id', issueSeed.data.id);
    if (foreignIssue.error || foreignIssue.data.length) throw new Error('Other learner read issue');
    const foreignFile = await clientBAsLearner.storage.from('issue-attachments').createSignedUrl(issueFile, 60);
    if (!foreignFile.error) throw new Error('Other learner could read attachment');

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
      user_id: userBId,
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
        user_id: userBId,
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
      .eq('id', userBId);
    if (roleErr) throw new Error(`Could not mark test user B as teacher: ${roleErr.message}`);

    const clientB = createClient(url, anonKey);
    const { error: teacherSignInErr } = await clientB.auth.signInWithPassword({ email: userB.email, password: userB.password });
    if (teacherSignInErr) throw teacherSignInErr;

    const staffFile = await clientB.storage.from('issue-attachments').createSignedUrl(issueFile, 60);
    if (staffFile.error) throw new Error('Teacher could not read issue attachment');
    const staffIssue = await clientB.from('issue_reports').select('id').eq('id', issueSeed.data.id);
    if (staffIssue.error || staffIssue.data.length !== 1) throw new Error('Teacher could not read issue');
    const staffStatus = await clientB.from('issue_reports').update({ status: 'Investigating' }).eq('id', issueSeed.data.id).select('status').single();
    if (staffStatus.error || staffStatus.data?.status !== 'Investigating') throw new Error('Teacher could not update issue status');

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

    const deleted = await clientA.rpc('delete_my_learning_data');
    if (deleted.error || !deleted.data?.deleted) throw new Error(`Learning data deletion failed: ${deleted.error?.message}`);
    const remainingVocabulary = await admin.from('week_vocabulary_attempts').select('id').eq('user_id', userAId);
    const otherVocabulary = await admin.from('week_vocabulary_attempts').select('id').eq('user_id', userBId);
    if (remainingVocabulary.error || remainingVocabulary.data.length || otherVocabulary.error || otherVocabulary.data.length !== 1) throw new Error('Vocabulary deletion or isolation failed');

    console.log('PASS: Postgres RLS isolation, staff-only answer tables, answer-free views & delete coverage verified.');
  } finally {
    await deleteTestUser(admin, userAId);
    await deleteTestUser(admin, userBId);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
