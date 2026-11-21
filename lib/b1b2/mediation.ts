/** Shared rules for safe, quota-aware mediation practice. */

// Voice mediation transcribes only: 2 units, not the 6 units of a full speaking evaluation.
export const MEDIATION_TRANSCRIBE_UNITS = 2;
export const MEDIATION_FEEDBACK_UNITS = 2;
export const SPEAKING_EVALUATE_UNITS = 6;
export const MEDIATION_LOW_CONFIDENCE_THRESHOLD = 0.6;

export interface MediationReviewInput {
  confidence: number | null;
  disputed?: boolean;
  attemptNumber?: number;
}

export interface MediationReviewDecision {
  needsReview: boolean;
  reviewReason: string | null;
}

/**
 * Mediation answers are human-checked only via the three existing rules:
 * low AI confidence, a learner dispute, and the 1-in-10 spot check.
 */
export function decideMediationReview({
  confidence,
  disputed = false,
  attemptNumber = 1,
}: MediationReviewInput): MediationReviewDecision {
  if (disputed) return { needsReview: true, reviewReason: 'disputed' };
  if (
    typeof confidence === 'number' &&
    Number.isFinite(confidence) &&
    confidence < MEDIATION_LOW_CONFIDENCE_THRESHOLD
  ) {
    return { needsReview: true, reviewReason: 'low_ai_confidence' };
  }
  if (attemptNumber > 0 && attemptNumber % 10 === 0) {
    return { needsReview: true, reviewReason: 'spot_check' };
  }
  return { needsReview: false, reviewReason: null };
}

export interface MediationAttemptInput {
  userId: string;
  week: number;
  taskKey: string;
  transcript: string | null;
  responseText: string | null;
  feedback: Record<string, unknown>;
  confidence: number | null;
  disputed?: boolean;
  attemptNumber?: number;
}

export interface MediationAttemptRow {
  user_id: string;
  week: number;
  task_key: string;
  transcript: string | null;
  response_text: string | null;
  feedback: Record<string, unknown>;
  needs_review: boolean;
  review_reason: string | null;
  disputed: boolean;
}

export function buildMediationAttempt(input: MediationAttemptInput): MediationAttemptRow {
  const decision = decideMediationReview({
    confidence: input.confidence,
    disputed: input.disputed,
    attemptNumber: input.attemptNumber,
  });

  return {
    user_id: input.userId,
    week: input.week,
    task_key: input.taskKey,
    transcript: input.transcript,
    response_text: input.responseText,
    feedback: input.feedback,
    needs_review: decision.needsReview,
    review_reason: decision.reviewReason,
    disputed: Boolean(input.disputed),
  };
}
