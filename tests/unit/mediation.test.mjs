import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  MEDIATION_FEEDBACK_UNITS,
  MEDIATION_TRANSCRIBE_UNITS,
  SPEAKING_EVALUATE_UNITS,
  buildMediationAttempt,
  decideMediationReview,
} from '../../lib/b1b2/mediation.ts';

test('voice mediation transcription costs 2 units, not the 6-unit speaking evaluation', () => {
  assert.equal(MEDIATION_TRANSCRIBE_UNITS, 2);
  assert.ok(MEDIATION_TRANSCRIBE_UNITS < SPEAKING_EVALUATE_UNITS);
  assert.equal(MEDIATION_FEEDBACK_UNITS, 2);
  assert.equal(SPEAKING_EVALUATE_UNITS, 6);

  const component = readFileSync(new URL('../../components/b1b2/MediationTask.tsx', import.meta.url), 'utf8');
  assert.match(component, /\/api\/speaking\/transcribe/);
  assert.doesNotMatch(component, /\/api\/speaking\/evaluate/);
});

test('every voice or typed submission is saved with its transcript or text and feedback', () => {
  const shared = {
    userId: 'learner-1',
    week: 4,
    taskKey: 'week-4-mediation',
    feedback: { criteria: [], corrections: [], readerNeed: 'Yes — ...' },
    confidence: 0.9,
  };

  const voice = buildMediationAttempt({
    ...shared,
    transcript: 'Do not miss the cathedral, the harbour and the old quarter.',
    responseText: null,
  });
  assert.equal(voice.user_id, 'learner-1');
  assert.equal(voice.week, 4);
  assert.equal(voice.task_key, 'week-4-mediation');
  assert.equal(voice.transcript, 'Do not miss the cathedral, the harbour and the old quarter.');
  assert.equal(voice.response_text, null);
  assert.deepEqual(voice.feedback, shared.feedback);
  assert.equal(voice.needs_review, false);

  const typed = buildMediationAttempt({
    ...shared,
    transcript: null,
    responseText: 'Take the train, not a taxi.',
  });
  assert.equal(typed.transcript, null);
  assert.equal(typed.response_text, 'Take the train, not a taxi.');
  assert.deepEqual(typed.feedback, shared.feedback);
});

test('feedback route saves the attempt and feeds corrections into the error log', () => {
  const route = readFileSync(
    new URL('../../src/app/api/mediation/feedback/route.ts', import.meta.url),
    'utf8',
  );
  assert.match(route, /\.from\('mediation_attempts'\)/);
  assert.match(route, /persistLearnerErrors\(supabase, \{/);
  assert.match(route, /sourceType: 'mediation'/);
  assert.match(route, /transcript: mode === 'voice' \? submission : null/);
  assert.match(route, /responseText: mode === 'text' \? submission : null/);
});

test('mediation enters the review queue only via confidence, dispute or 1-in-10 spot check', () => {
  assert.deepEqual(decideMediationReview({ confidence: 0.9, attemptNumber: 3 }), {
    needsReview: false,
    reviewReason: null,
  });
  assert.equal(decideMediationReview({ confidence: 0.4, attemptNumber: 3 }).reviewReason, 'low_ai_confidence');
  assert.equal(decideMediationReview({ confidence: 0.9, disputed: true, attemptNumber: 3 }).reviewReason, 'disputed');
  assert.equal(decideMediationReview({ confidence: 0.9, attemptNumber: 10 }).reviewReason, 'spot_check');
  assert.equal(decideMediationReview({ confidence: 0.9, attemptNumber: 20 }).reviewReason, 'spot_check');
  assert.equal(decideMediationReview({ confidence: 0.9, attemptNumber: 11 }).needsReview, false);
});
