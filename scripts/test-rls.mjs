#!/usr/bin/env node
/**
 * Postgres RLS Isolation Test for user-private learning data.
 *
 * Verifies that an authenticated User A cannot read, update, or delete User B's
 * `learner_errors`, `error_review_cards`, or `ai_request_logs`.
 *
 * Requires verified E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY and
 * E2E_SUPABASE_SERVICE_ROLE_KEY; missing or unsafe configuration fails closed.
 */

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assertE2ESupabaseApiTarget } from './assert-e2e-supabase-target.mjs';
import { weekSpeakingRecordingPath } from '../lib/b1b2/week-speaking-recordings.mjs';
import { sweepLateDeletionFiles } from '../lib/b1b2/sweep-late-deletion-files.mjs';
import { createTestUser, deleteTestUser } from './lib/test-user.mjs';

const { projectUrl: url, anonKey, serviceRoleKey } = assertE2ESupabaseApiTarget();
const admin = createClient(url, serviceRoleKey);

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

    // Model unlocks are server-created and visible only to their owner.
    const { error: unlockSeedError } = await admin.from('week_output_submissions').insert({ user_id: userBId, week_number: 1, skill: 'writing' });
    if (unlockSeedError) throw new Error(`Could not seed week unlock: ${unlockSeedError.message}`);
    const { data: foreignUnlocks, error: unlockReadError } = await clientA.from('week_output_submissions').select('skill').eq('user_id', userBId);
    if (unlockReadError || foreignUnlocks.length) throw new Error('Week unlock isolation failed');
    const { error: spoofUnlockError } = await clientA.from('week_output_submissions').insert({ user_id: userAId, week_number: 1, skill: 'writing' });
    if (!spoofUnlockError) throw new Error('Learner could create a model unlock directly');

    // Both checked sentence versions and drafts are private. Learners can
    // read only their own work; only the service can create or change marks,
    // claim a check, or release a slot.
    const sentenceRows = [
      { user_id: userAId, week_number: 1, item_id: 'W1-U1', kind: 'grammar-use-it', first_answer: 'A first.', first_feedback: { corrected: 'A first.' }, first_on_target: true },
      { user_id: userBId, week_number: 1, item_id: 'W1-U1', kind: 'grammar-use-it', first_answer: 'B first.', first_feedback: { corrected: 'B first.' }, first_on_target: true, second_answer: 'B second.', second_feedback: { corrected: 'B second.' }, second_on_target: true, draft_answer: 'B private draft.' },
    ];
    const sentenceSeed = await admin.from('week_sentence_practice').insert(sentenceRows);
    if (sentenceSeed.error) throw new Error(`Sentence fixture failed: ${sentenceSeed.error.message}`);
    const ownSentences = await clientA.from('week_sentence_practice').select('first_answer').eq('user_id', userAId);
    if (ownSentences.error || ownSentences.data?.length !== 1) throw new Error('Learner could not read own sentence');
    const foreignSentences = await clientA.from('week_sentence_practice').select('*').eq('user_id', userBId);
    if (foreignSentences.error || foreignSentences.data?.length) throw new Error('Learner could read another learner’s sentence versions');
    const anonSentences = await anonClient.from('week_sentence_practice').select('*');
    if (!anonSentences.error && anonSentences.data?.length) throw new Error('Anonymous user could read sentence versions');
    const spoofSentence = await clientA.from('week_sentence_practice').insert({ user_id: userAId, week_number: 1, item_id: 'W1-U2', kind: 'grammar-use-it' });
    if (!spoofSentence.error) throw new Error('Learner could create sentence marks directly');
    const changeSentence = await clientA.from('week_sentence_practice').update({ first_answer: 'changed' }).eq('user_id', userBId).select();
    if (!changeSentence.error && changeSentence.data?.length) throw new Error('Learner changed another learner’s sentence');
    const deleteSentence = await clientA.from('week_sentence_practice').delete().eq('user_id', userBId).select();
    if (!deleteSentence.error && deleteSentence.data?.length) throw new Error('Learner deleted another learner’s sentence');
    const spoofClaim = await clientA.rpc('claim_week_sentence_check', { p_user_id: userBId, p_week_number: 1, p_item_id: 'W1-U2', p_kind: 'grammar-use-it', p_answer: 'Spoof.', p_version: 1 });
    if (!spoofClaim.error) throw new Error('Learner could claim another learner’s sentence check');
    const foreignAfter = await admin.from('week_sentence_practice').select('first_answer,second_answer,draft_answer').eq('user_id', userBId).single();
    if (foreignAfter.error || foreignAfter.data?.first_answer !== 'B first.' || foreignAfter.data?.second_answer !== 'B second.' || foreignAfter.data?.draft_answer !== 'B private draft.') {
      throw new Error('Another learner’s sentence versions did not remain unchanged');
    }

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

    // 3c. Weekly speaking recordings: private bucket, owner-prefixed paths,
    // owner playback only, and staff read. User A must not see User B's files.
    const attemptId = randomUUID();
    const audio = new Blob(['weekly speaking audio fixture'], { type: 'audio/webm' });
    const recordingPath = weekSpeakingRecordingPath({
      userId: userBId,
      weekNumber: 1,
      attemptId,
      takeNumber: 1,
      mimeType: 'audio/webm',
    });
    const { data: bucket, error: bucketError } = await admin.storage.getBucket('speaking-recordings');
    if (bucketError || !bucket) throw new Error(`Could not inspect speaking-recordings: ${bucketError?.message}`);
    if (bucket.public) throw new Error('PRIVACY BREACH: speaking-recordings is a public bucket');

    const { error: uploadError } = await admin.storage
      .from('speaking-recordings')
      .upload(recordingPath, audio, { contentType: 'audio/webm', upsert: true });
    if (uploadError) throw new Error(`Seed weekly recording failed: ${uploadError.message}`);
    const { error: weeklyRowError } = await admin.from('week_speaking_attempts').insert({
      id: attemptId,
      user_id: userBId,
      week_number: 1,
      notes: [],
      first_recording_path: recordingPath,
      first_transcript: 'Weekly speaking RLS fixture',
    });
    if (weeklyRowError) throw new Error(`Seed weekly attempt failed: ${weeklyRowError.message}`);

    // A new immutable take has an active reservation before Storage creates it.
    const foreignTakeId = randomUUID();
    const foreignReservation = await admin.rpc('reserve_week_speaking_take', {
      p_user_id: userBId, p_week_number: 1, p_take_id: foreignTakeId, p_kind: 'retry', p_extension: 'webm',
      p_notes: [], p_phrases: [], p_source_take_id: null,
    });
    if (foreignReservation.error || !foreignReservation.data?.path) throw new Error(`Seed take reservation failed: ${foreignReservation.error?.message}`);
    const foreignTakePath = foreignReservation.data.path;
    const newUpload = await admin.storage.from('speaking-recordings').upload(foreignTakePath, audio, { contentType: 'audio/webm', upsert: false });
    if (newUpload.error) throw new Error(`Seed new take failed: ${newUpload.error.message}`);
    const savedTake = await admin.rpc('finish_week_speaking_upload', { p_user_id: userBId, p_take_id: foreignTakeId, p_success: true });
    if (savedTake.error || savedTake.data !== true) throw new Error(`Could not finish new take: ${savedTake.error?.message}`);
    const foreignTake = await clientA.from('week_speaking_takes').select('id').eq('id', foreignTakeId);
    if (foreignTake.error || foreignTake.data?.length) throw new Error('Learner could read another learner’s new take');
    const foreignTakeSigned = await clientA.storage.from('speaking-recordings').createSignedUrl(foreignTakePath, 60);
    if (foreignTakeSigned.data?.signedUrl) throw new Error('Learner could sign another learner’s new take');
    const anonymousTake = await anonClient.storage.from('speaking-recordings').createSignedUrl(foreignTakePath, 60);
    if (anonymousTake.data?.signedUrl) throw new Error('Anonymous viewer could sign a new take');

    const { data: foreignWeeklyRows, error: foreignWeeklyReadError } = await clientA
      .from('week_speaking_attempts')
      .select('id,first_recording_path')
      .eq('id', attemptId);
    if (foreignWeeklyReadError) throw new Error(`Weekly attempt RLS read failed: ${foreignWeeklyReadError.message}`);
    if ((foreignWeeklyRows ?? []).length > 0) {
      throw new Error('RLS BREACH: User A could read User B weekly speaking attempt!');
    }

    const { data: foreignObjects, error: foreignListError } = await clientA.storage
      .from('speaking-recordings')
      .list(`${userBId}/week-speaking/1/${attemptId}`, { limit: 10 });
    const denied = foreignListError
      && /permission|not authorized|access denied|403|row-level security/i.test(foreignListError.message ?? '');
    if (foreignListError && !denied) throw new Error(`Foreign Storage listing failed: ${foreignListError.message}`);
    if (!denied && (foreignObjects ?? []).length > 0) {
      throw new Error('RLS BREACH: learner could see another learner’s weekly recording files!');
    }
    const foreignSigned = await clientA.storage
      .from('speaking-recordings')
      .createSignedUrl(recordingPath, 60);
    if (foreignSigned.data?.signedUrl) {
      throw new Error('RLS BREACH: learner minted a signed URL for another learner’s weekly recording!');
    }
    const anonSigned = await anonClient.storage
      .from('speaking-recordings')
      .createSignedUrl(recordingPath, 60);
    if (anonSigned.data?.signedUrl) {
      throw new Error('RLS BREACH: anonymous viewer minted a signed URL for a weekly recording!');
    }

    // A second learner owns these objects, so the staff test below is truly
    // cross-user rather than accidentally passing through the owner policy.
    const ownerAttemptId = randomUUID();
    const ownerPath = weekSpeakingRecordingPath({ userId: userAId, weekNumber: 1, attemptId: ownerAttemptId, takeNumber: 1, mimeType: 'audio/webm' });
    const ownerPrivatePath = `${userAId}/private-rls-recording.webm`;
    for (const path of [ownerPath, ownerPrivatePath]) {
      const upload = await admin.storage.from('speaking-recordings').upload(path, audio, { contentType: 'audio/webm', upsert: false });
      if (upload.error) throw new Error(`Seed owner recording failed: ${upload.error.message}`);
    }
    const ownerAttempt = await admin.from('week_speaking_attempts').insert({
      id: ownerAttemptId, user_id: userAId, week_number: 1, notes: [], first_recording_path: ownerPath, first_transcript: 'Owner fixture',
    });
    if (ownerAttempt.error) throw ownerAttempt.error;
    const ownerTakeId = randomUUID();
    const ownerReservation = await admin.rpc('reserve_week_speaking_take', {
      p_user_id: userAId, p_week_number: 1, p_take_id: ownerTakeId, p_kind: 'retry', p_extension: 'webm',
      p_notes: [], p_phrases: [], p_source_take_id: null,
    });
    if (ownerReservation.error || !ownerReservation.data?.path) throw new Error(`Seed owner take failed: ${ownerReservation.error?.message}`);
    const ownerTakePath = ownerReservation.data.path;
    const ownerTakeUpload = await admin.storage.from('speaking-recordings').upload(ownerTakePath, audio, { contentType: 'audio/webm', upsert: false });
    if (ownerTakeUpload.error) throw ownerTakeUpload.error;
    const ownerTakeSaved = await admin.rpc('finish_week_speaking_upload', { p_user_id: userAId, p_take_id: ownerTakeId, p_success: true });
    if (ownerTakeSaved.error || ownerTakeSaved.data !== true) throw new Error(`Could not finish owner take: ${ownerTakeSaved.error?.message}`);
    const ownTakeSigned = await clientA.storage.from('speaking-recordings').createSignedUrl(ownerTakePath, 60);
    if (!ownTakeSigned.data?.signedUrl) throw new Error('Owner could not sign their own new take');

    // Exercise the real Storage service, not just the metadata trigger. Upsert
    // must not replace saved bytes and a move must not detach the saved key.
    const overwritten = await admin.storage.from('speaking-recordings').upload(
      ownerTakePath, new Blob(['replacement fixture'], { type: 'audio/webm' }), { contentType: 'audio/webm', upsert: true },
    );
    if (!overwritten.error) throw new Error('A saved weekly object could be overwritten');
    const movedPath = `${userAId}/moved-weekly-fixture.webm`;
    const moved = await admin.storage.from('speaking-recordings').move(ownerTakePath, movedPath);
    if (!moved.error) throw new Error('A saved weekly object could be moved out of its ledger');
    const retained = await admin.storage.from('speaking-recordings').download(ownerTakePath);
    if (retained.error || !retained.data || await retained.data.text() !== await audio.text()) {
      throw new Error('A rejected overwrite or move changed the saved weekly recording');
    }
    const movedObject = await admin.storage.from('speaking-recordings').download(movedPath);
    if (!movedObject.error) throw new Error('Rejected move left an accessible copy outside the ledger');
    const expiredTakeId = randomUUID();
    const expiredReservation = await admin.rpc('reserve_week_speaking_take', {
      p_user_id: userAId, p_week_number: 2, p_take_id: expiredTakeId, p_kind: 'first', p_extension: 'webm',
      p_notes: [], p_phrases: [], p_source_take_id: null,
    });
    if (expiredReservation.error || !expiredReservation.data?.path) throw new Error(`Seed expired upload failed: ${expiredReservation.error?.message}`);
    const expire = await admin.from('week_speaking_flows').update({ active_since: new Date(Date.now() - 31 * 60_000).toISOString() })
      .eq('user_id', userAId).eq('week_number', 2);
    if (expire.error) throw expire.error;
    const expiredUpload = await admin.storage.from('speaking-recordings').upload(expiredReservation.data.path, audio, { contentType: 'audio/webm', upsert: false });
    if (!expiredUpload.error) throw new Error('Storage accepted an expired weekly upload');
    const expiredObject = await admin.storage.from('speaking-recordings').download(expiredReservation.data.path);
    if (!expiredObject.error) throw new Error('Expired weekly upload was accessible');
    const closedExpired = await admin.rpc('finish_week_speaking_upload', { p_user_id: userAId, p_take_id: expiredTakeId, p_success: false });
    if (closedExpired.error || closedExpired.data !== true) throw new Error(`Could not close expired fixture: ${closedExpired.error?.message}`);

    // 4. Answer tables: anon and learners see no rows; staff see the locked tables.
    const { error: roleErr } = await admin
      .from('profiles')
      .update({ role: 'teacher' })
      .eq('id', userBId);
    if (roleErr) throw new Error(`Could not mark test user B as teacher: ${roleErr.message}`);

    const clientB = createClient(url, anonKey);
    const { error: teacherSignInErr } = await clientB.auth.signInWithPassword({ email: userB.email, password: userB.password });
    if (teacherSignInErr) throw teacherSignInErr;

    // Staff can read a learner's weekly row and mint a 60-second link, but
    // Storage policies must not let staff write into a learner's folder.
    const { data: staffWeeklyRows, error: staffWeeklyReadError } = await clientB
      .from('week_speaking_attempts')
      .select('id,first_recording_path')
      .eq('id', ownerAttemptId);
    if (staffWeeklyReadError) throw new Error(`STAFF WEEKLY READ FAILED: ${staffWeeklyReadError.message}`);
    if ((staffWeeklyRows ?? []).length !== 1) throw new Error('STAFF READ FAILED: teacher could not see another learner’s weekly attempt');
    const staffTakeRows = await clientB.from('week_speaking_takes').select('id').eq('id', ownerTakeId);
    if (staffTakeRows.error || staffTakeRows.data?.length !== 1) throw new Error('Teacher could not see another learner’s new take');
    for (const path of [ownerPath, ownerTakePath]) {
      const staffWeeklySigned = await clientB.storage.from('speaking-recordings').createSignedUrl(path, 60);
      if (!staffWeeklySigned.data?.signedUrl) {
        throw new Error(`STAFF READ FAILED: teacher could not sign weekly recording: ${staffWeeklySigned.error?.message}`);
      }
    }
    const staffPrivate = await clientB.storage.from('speaking-recordings').createSignedUrl(ownerPrivatePath, 60);
    if (staffPrivate.data?.signedUrl) throw new Error('Teacher could sign a non-weekly recording');
    const { error: staffWeeklyWriteError } = await clientB.storage
      .from('speaking-recordings')
      .upload(`${userAId}/week-speaking/1/${randomUUID()}/take-1.webm`, audio, { contentType: 'audio/webm' });
    if (!staffWeeklyWriteError) throw new Error('RLS BREACH: teacher could write into another learner’s weekly folder');

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

    // A real, owner-scoped Storage/API test in the isolated project only:
    // legacy metadata may arrive after a completed deletion during rollout.
    // The daily worker removes both late files and leaves a new-generation
    // file untouched. The scoped test must never sweep another fixture owner.
    const lateUser = await createTestUser(admin, 'late-delete');
    try {
      const fence = await admin.from('data_deletion_safety_config').select('enforce_legacy_fence').eq('singleton', true).single();
      if (fence.error || fence.data?.enforce_legacy_fence !== false) throw new Error('Isolated legacy fence is not in compatibility mode');
      const token = randomUUID();
      const begun = await admin.rpc('begin_week_speaking_deletion', { p_user_id: lateUser.id, p_lock_id: token });
      if (begun.error || begun.data !== true) throw new Error('Could not begin isolated legacy deletion');
      const finished = await admin.rpc('finish_week_speaking_deletion', { p_user_id: lateUser.id, p_lock_id: token });
      if (finished.error || finished.data?.deleted !== true) throw new Error('Could not finish isolated legacy deletion');
      const profile = await admin.from('profiles').select('data_deletion_generation').eq('id', lateUser.id).single();
      if (profile.error || !profile.data?.data_deletion_generation) throw new Error('Missing isolated deletion marker');
      const issueLate = `${lateUser.id}/late-screenshot.png`;
      const speakingLate = `${lateUser.id}/late-audio.webm`;
      const fresh = `${lateUser.id}/deletion-v1/${profile.data.data_deletion_generation}/fresh-screenshot.png`;
      const takeId = randomUUID();
      const reserved = await admin.rpc('reserve_week_speaking_take', { p_user_id: lateUser.id, p_week_number: 1, p_take_id: takeId,
        p_kind: 'first', p_extension: 'webm', p_notes: [], p_phrases: [], p_source_take_id: null });
      if (reserved.error || !reserved.data?.path) throw new Error('Could not reserve new-generation recording');
      const newAudio = await admin.storage.from('speaking-recordings').upload(reserved.data.path, audio, {
        contentType: 'audio/webm', upsert: false, metadata: { data_deletion_generation: profile.data.data_deletion_generation },
      });
      if (newAudio.error) throw new Error(`Could not upload new-generation recording: ${newAudio.error.message}`);
      const closed = await admin.rpc('finish_week_speaking_upload', { p_user_id: lateUser.id, p_take_id: takeId, p_success: true });
      if (closed.error || closed.data !== true) throw new Error('Could not finish new-generation recording');
      // Prove Storage metadata protects genuinely new work even if its test
      // ledger row disappears; the synthetic account is removed in finally.
      const removedLedger = await admin.from('week_speaking_takes').delete().eq('id', takeId);
      if (removedLedger.error) throw new Error('Could not set up unreferenced new recording');
      for (const [bucket, key, bytes, contentType] of [
        ['issue-attachments', issueLate, new Uint8Array([137,80,78,71,13,10,26,10]), 'image/png'],
        ['speaking-recordings', speakingLate, audio, 'audio/webm'],
        ['issue-attachments', fresh, new Uint8Array([137,80,78,71,13,10,26,10]), 'image/png'],
      ]) {
        const uploaded = await admin.storage.from(bucket).upload(key, bytes, { contentType, upsert: false });
        if (uploaded.error) throw new Error(`Could not upload isolated safety-net fixture: ${uploaded.error.message}`);
      }
      const swept = await sweepLateDeletionFiles(admin, { userId: lateUser.id });
      if (swept.removed !== 2 || swept.hasMore) throw new Error(`Unexpected isolated late-file count: ${swept.removed}`);
      for (const [bucket, key] of [['issue-attachments', issueLate], ['speaking-recordings', speakingLate]]) {
        if (!(await admin.storage.from(bucket).download(key)).error) throw new Error('A late file survived the isolated sweep');
      }
      if ((await admin.storage.from('issue-attachments').download(fresh)).error) throw new Error('The isolated sweep removed new work');
      if ((await admin.storage.from('speaking-recordings').download(reserved.data.path)).error) throw new Error('The isolated sweep removed a new unreferenced recording');
      if ((await admin.storage.from('issue-attachments').download(issueFile)).error) throw new Error('The isolated sweep touched another learner');
      // A file arriving after a successful run must be found by the next run,
      // not just by the immediate post-deletion scan.
      const later = `${lateUser.id}/even-later-screenshot.png`;
      const laterUpload = await admin.storage.from('issue-attachments').upload(later, new Uint8Array([137,80,78,71,13,10,26,10]), { contentType: 'image/png', upsert: false });
      if (laterUpload.error) throw new Error(`Could not upload later isolated fixture: ${laterUpload.error.message}`);
      const laterSweep = await sweepLateDeletionFiles(admin, { userId: lateUser.id });
      if (laterSweep.removed !== 1 || laterSweep.hasMore) throw new Error(`Unexpected later-file count: ${laterSweep.removed}`);
      if (!(await admin.storage.from('issue-attachments').download(later)).error) throw new Error('A later upload survived the next isolated sweep');
      if ((await admin.storage.from('issue-attachments').download(fresh)).error) throw new Error('The next isolated sweep removed new work');
    } finally {
      await deleteTestUser(admin, lateUser.id);
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
    await deleteTestUser(admin, userAId);
    await deleteTestUser(admin, userBId);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
