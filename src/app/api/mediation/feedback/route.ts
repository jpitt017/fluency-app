import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { createGroqJsonCompletion } from '@/lib/b1b2/groq-json';
import {
  CorrectionItemSchema,
  persistLearnerErrors,
  type CorrectionItem,
} from '@/lib/b1b2/feedback-schema';
import { MEDIATION_FEEDBACK_UNITS, buildMediationAttempt } from '@/lib/b1b2/mediation';
import { logAiRequest } from '@/lib/b1b2/observability';
import { providerFailureResponse, reportProviderFailure } from '@/lib/b1b2/provider-failure-response';
import { UNTRUSTED_DATA_SYSTEM_RULE, sanitizeLearnerText, wrapLearnerSubmission } from '@/lib/b1b2/prompt-guard';

const QUOTA_ENDPOINT = '/api/writing/correct'; // reuse the writing AI quota bucket
const LOG_ENDPOINT = '/api/mediation/feedback';
const MODEL_ID = 'openai/gpt-oss-20b';
const MAX_CHARS = 3000;

// These are the categories supported by the learner_errors DB enum.
const DB_ERROR_CATEGORIES = [
  'article',
  'preposition',
  'tense',
  'collocation',
  'word_order',
  'connector',
] as const;

const SYSTEM_PROMPT = `You are a supportive CEFR B1 → B2 mediation assessor.
Give concise feedback on exactly four criteria: Task fulfilment, Clarity for the reader, Language accuracy, Organisation.
Then answer one extra question in a single line: "Did the reader get what they need?"
Do not mark mediation as required for unlocking; it is recommended practice only.
Write every note in clear, simple British English.

Return at most three concrete language corrections from the learner's own words. Use only these categories: ${DB_ERROR_CATEGORIES.join(', ')}.
The corrected sentence must keep the learner's ideas. Don't add new information or phrases.
Also return a confidence between 0 and 1 in your own assessment. Low confidence means the response is ambiguous or hard to assess.

${UNTRUSTED_DATA_SYSTEM_RULE}

Return strictly valid JSON with no markdown fences:
{
  "criteria": [
    { "label": "Task fulfilment", "note": "string" },
    { "label": "Clarity for the reader", "note": "string" },
    { "label": "Language accuracy", "note": "string" },
    { "label": "Organisation", "note": "string" }
  ],
  "readerNeed": "Yes — ... | Partly — ... | No — ...",
  "feedback": "string (2 encouraging sentences)",
  "suggestion": "string (one concrete improvement)",
  "confidence": 0.85,
  "corrections": [
    {
      "original": "exact phrase from the learner's response",
      "corrected_sentence": "natural corrected phrase",
      "error_category": "tense",
      "explanation": "short, simple explanation",
      "severity": "minor"
    }
  ]
}`;

interface FeedbackBody {
  text?: string;
  prompt?: string;
  output?: string;
  source?: string;
  scale?: string;
  level?: string;
  week?: number;
  taskKey?: string;
  mode?: 'voice' | 'text';
}

function asNote(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function parseCorrections(value: unknown): CorrectionItem[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(DB_ERROR_CATEGORIES);
  return value.slice(0, 3).flatMap((item) => {
    const parsed = CorrectionItemSchema.safeParse(item);
    if (!parsed.success || !allowed.has(parsed.data.error_category)) return [];
    return [parsed.data];
  });
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const supabase = await createServerSupabase();
  if (!supabase) {
    console.error('[mediation] database client is not configured');
    return NextResponse.json({ error: 'Something went wrong. Please try again, or message your teacher.' }, { status: 503 });
  }
  let statusCode = 200;
  let inputChars = 0;
  let errorMessage: string | null = null;
  let isSignedIn = false;

  try {
    const guard = await enforceAiUsage(supabase, QUOTA_ENDPOINT, MEDIATION_FEEDBACK_UNITS);
    isSignedIn = Boolean(guard.userId);
    if (!guard.allowed && guard.response) {
      statusCode = guard.response.status;
      return guard.response;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      statusCode = 503;
      const failure = await providerFailureResponse({
        admin: supabase,
        endpoint: LOG_ENDPOINT,
        model: MODEL_ID,
        error: Object.assign(new Error('GROQ_API_KEY is not configured'), { status: 401 }),
        workSaved: false,
        headers: guard.headers,
      });
      errorMessage = failure.errorMessage;
      return failure.response;
    }

    const body = (await req.json().catch(() => ({}))) as FeedbackBody;
    const { text: submission } = sanitizeLearnerText(body.text, MAX_CHARS);
    if (!submission) {
      statusCode = 400;
      return NextResponse.json({ error: 'Please provide a mediation response.' }, { status: 400, headers: guard.headers });
    }
    inputChars = submission.length;

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      statusCode = 401;
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers: guard.headers });
    }

    const clean = (value: unknown, max: number) => sanitizeLearnerText(value, max).text;
    const week = Math.min(32, Math.max(1, Math.round(Number(body.week) || 1)));
    const taskKey = clean(body.taskKey, 120) || `week-${week}-mediation`;
    const mode = body.mode === 'voice' ? 'voice' : 'text';
    const feedbackContext = {
      prompt: clean(body.prompt, 500),
      source: clean(body.source, 200),
      output: clean(body.output, 200),
      scale: clean(body.scale, 200),
      level: clean(body.level, 20),
      week,
      taskKey,
      mode,
    };

    const userPrompt = [
      `Week: ${week}`,
      `Mediation prompt: ${feedbackContext.prompt || 'Mediation task'}`,
      `Source: ${feedbackContext.source || 'Not specified'}`,
      `Required output: ${feedbackContext.output || 'Short message'}`,
      `CEFR scale: ${feedbackContext.scale || 'Mediation'}`,
      `Level: ${feedbackContext.level || 'B1'}`,
      '',
      wrapLearnerSubmission(submission),
    ].join('\n');

    let parsed: Record<string, unknown> = {};
    let confidence: number | null = null;
    let corrections: CorrectionItem[] = [];
    try {
      const completion = await createGroqJsonCompletion(new Groq({ apiKey }), {
        model: MODEL_ID,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.25,
        maxCompletionTokens: 1536,
      });
      parsed = completion.parsed;
      confidence = parseConfidence(parsed.confidence);
      corrections = parseCorrections(parsed.corrections);
    } catch (error) {
      // An unavailable assessor is a low-confidence signal, never a lost submission:
      // the attempt is still inserted below and the learner keeps their work, so
      // this path says "saved" truthfully. A dead key still needs to reach a human,
      // which reportProviderFailure does (log + alert for 401/429/daily quota).
      const reported = await reportProviderFailure({
        admin: supabase,
        endpoint: LOG_ENDPOINT,
        model: MODEL_ID,
        error,
        workSaved: true,
      });
      errorMessage = reported.errorMessage;
      // Zero confidence already routes this attempt to a teacher through
      // decideMediationReview (low_ai_confidence), which is exactly right when the
      // criteria below are placeholders rather than real feedback.
      confidence = 0;
    }

    const { count: priorAttempts } = await supabase
      .from('mediation_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    const attemptNumber = (priorAttempts ?? 0) + 1;

    const { data: inserted, error: insertError } = await supabase
      .from('mediation_attempts')
      .insert(
        buildMediationAttempt({
          userId: user.id,
          week,
          taskKey,
          transcript: mode === 'voice' ? submission : null,
          responseText: mode === 'text' ? submission : null,
          feedback: {
            criteria: [],
            corrections,
            context: feedbackContext,
            ...(errorMessage ? { assessorError: errorMessage.slice(0, 200) } : {}),
          },
          confidence,
          attemptNumber,
        }),
      )
      .select('id, needs_review, review_reason')
      .single();

    if (insertError || !inserted) {
      statusCode = 500;
      console.error('Failed to save mediation_attempts row:', insertError?.message);
      return NextResponse.json(
        { error: 'Could not save your mediation attempt. Please try again.' },
        { status: 500, headers: guard.headers },
      );
    }

    const rawCriteria = Array.isArray(parsed.criteria) ? parsed.criteria : [];
    const fallbackLabels = ['Task fulfilment', 'Clarity for the reader', 'Language accuracy', 'Organisation'];
    const criteria = fallbackLabels.map((label, index) => {
      const item = rawCriteria[index] as Record<string, unknown> | undefined;
      return {
        label: asNote(item?.label) || label,
        note: asNote(item?.note) || 'No specific note was returned for this criterion.',
      };
    });

    const feedback = {
      criteria,
      readerNeed: asNote(parsed.readerNeed) || 'Partly — check whether your reader has all the key information.',
      feedback: asNote(parsed.feedback) || 'Good attempt at relaying the information clearly.',
      suggestion: asNote(parsed.suggestion) || 'Add one concrete detail from the source next time.',
      corrections: corrections.map((item) => ({
        original: item.original,
        correctedSentence: item.corrected_sentence,
        errorCategory: item.error_category,
        explanation: item.explanation,
      })),
    };

    const { error: feedbackUpdateError } = await supabase
      .from('mediation_attempts')
      .update({ feedback })
      .eq('id', inserted.id);
    if (feedbackUpdateError) console.error('Failed to update mediation feedback JSON:', feedbackUpdateError.message);

    if (corrections.length) {
      await persistLearnerErrors(supabase, {
        userId: user.id,
        sourceType: 'mediation',
        sourceId: inserted.id,
        sourceText: submission,
        sourceWordCount: submission.split(/\s+/).length,
        corrections,
      });
    }

    return NextResponse.json(
      {
        ...feedback,
        attemptId: inserted.id,
        saved: true,
        needsReview: inserted.needs_review,
        reviewReason: inserted.review_reason,
      },
      { headers: guard.headers },
    );
  } catch (error) {
    // Failures before the insert are things like a bad body or a rejected write,
    // not the provider: describe them, but keep the learner's copy generic and
    // never echo err.message, which can quote SQL or an env var name.
    const reported = await reportProviderFailure({
      admin: supabase,
      endpoint: LOG_ENDPOINT,
      model: MODEL_ID,
      error,
      workSaved: false,
    });
    statusCode = 500;
    errorMessage = reported.errorMessage;
    console.error(`${LOG_ENDPOINT} failed`, error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again, or message your teacher.' },
      { status: statusCode },
    );
  } finally {
    await logAiRequest(supabase, {
      endpoint: LOG_ENDPOINT,
      model: MODEL_ID,
      statusCode,
      latencyMs: Date.now() - startedAt,
      cacheHit: false,
      inputChars,
      errorMessage,
    }, isSignedIn);
  }
}
