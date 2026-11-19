import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import type { Evaluation, SpeakingTask, WritingTask } from '@/lib/b1b2/types';

export const maxDuration = 60;

const MODEL = 'openai/gpt-oss-20b';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const SPEAKING_CRITERIA = ['fluency', 'lexical_range', 'grammar_accuracy', 'coherence', 'pronunciation'] as const;
const WRITING_CRITERIA = ['task_response', 'organisation', 'grammar_accuracy', 'lexical_range', 'style'] as const;

function groqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
  return new Groq({ apiKey });
}

function clampScore(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function parseJson(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asStringArray(value: unknown, limit = 4) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, limit) : [];
}

function buildEvaluation(
  parsed: Record<string, unknown> | null,
  criteria: readonly string[],
  fallbackFeedback: string,
): Evaluation {
  const scores: Record<string, number> = {};
  const source = (parsed?.scores ?? parsed ?? {}) as Record<string, unknown>;
  let sum = 0;
  let count = 0;

  for (const criterion of criteria) {
    const raw = source[criterion] ?? (parsed as Record<string, unknown> | null)?.[criterion];
    const value = clampScore(raw);
    scores[criterion] = value;
    if (value > 0) {
      sum += value;
      count += 1;
    }
  }

  const explicitOverall = clampScore(parsed?.overall);
  const overall = explicitOverall > 0 ? explicitOverall : count ? Math.round(sum / count) : 0;

  return {
    overall,
    scores,
    feedback: typeof parsed?.feedback === 'string' ? parsed.feedback : fallbackFeedback,
    strengths: asStringArray(parsed?.strengths),
    improvements: asStringArray(parsed?.improvements),
    transcript: typeof parsed?.transcript === 'string' ? parsed.transcript : undefined,
    corrected: typeof parsed?.corrected === 'string' ? parsed.corrected : undefined,
    model: MODEL,
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to get feedback' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    kind?: 'speaking' | 'writing';
    attemptId?: string;
    submissionId?: string;
  };

  const kind = body.kind;
  const recordId = kind === 'speaking' ? body.attemptId : body.submissionId;
  if ((kind !== 'speaking' && kind !== 'writing') || !recordId) {
    return NextResponse.json({ error: 'kind and a record id are required' }, { status: 400 });
  }

  let groq: Groq;
  try {
    groq = groqClient();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Groq is not configured' }, { status: 500 });
  }

  try {
    if (kind === 'speaking') {
      return await scoreSpeaking({ groq, supabase, userId: user.id, attemptId: recordId });
    }
    return await scoreWriting({ groq, supabase, userId: user.id, submissionId: recordId });
  } catch (error) {
    console.error('curriculum score failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not score that submission' },
      { status: 500 },
    );
  }
}

async function scoreSpeaking({
  groq,
  supabase,
  userId,
  attemptId,
}: {
  groq: Groq;
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;
  userId: string;
  attemptId: string;
}) {
  const { data: attempt, error } = await supabase
    .from('speaking_attempts')
    .select('id, audio_path, task_id, lesson_id, duration_seconds, status')
    .eq('id', attemptId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!attempt) return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
  if (!attempt.audio_path) return NextResponse.json({ error: 'That attempt has no audio file' }, { status: 400 });

  const { data: file, error: downloadError } = await supabase.storage.from('speaking-recordings').download(attempt.audio_path);
  if (downloadError || !file) {
    return NextResponse.json({ error: downloadError?.message ?? 'Could not read the recording' }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Recording exceeds the 10 MB limit' }, { status: 413 });
  }

  const transcription = await groq.audio.transcriptions.create({
    file: new File([file], 'attempt.webm', { type: file.type || 'audio/webm' }),
    model: 'whisper-large-v3-turbo',
    language: 'en',
    response_format: 'json',
  });

  const transcript = (transcription.text ?? '').trim();
  if (!transcript) {
    return NextResponse.json({ error: 'No speech detected in the recording — check your microphone and try again.' }, { status: 400 });
  }

  const task = attempt.task_id
    ? (await supabase.from('speaking_tasks').select('*').eq('id', attempt.task_id).maybeSingle()).data as SpeakingTask | null
    : null;

  const systemPrompt = `You are a Cambridge CEFR B1-B2 speaking examiner. Score the transcript against the five criteria, 0-100 each.
Be calibrated: 60 = borderline B1, 70 = solid B1, 80 = entering B2, 90 = solid B2.
Return strictly valid JSON with no markdown:
{"scores":{"fluency":0,"lexical_range":0,"grammar_accuracy":0,"coherence":0,"pronunciation":0},"overall":0,"feedback":"2-3 sentences","strengths":["..."],"improvements":["..."],"corrected":"a more natural version of two or three sentences from the transcript"}`;

  const userPrompt = `Task: ${task?.prompt ?? 'Free speaking practice'}
Target seconds: ${task?.target_seconds ?? attempt.duration_seconds ?? 60}; recorded: ${attempt.duration_seconds ?? 'unknown'} seconds.
Target linkers: ${(task?.target_linkers ?? []).join(', ') || 'none'}
Target terms: ${(task?.target_terms ?? []).join(', ') || 'none'}

Transcript:
"""
${transcript}
"""`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 900,
    response_format: { type: 'json_object' },
  });

  const evaluation = buildEvaluation(
    parseJson(completion.choices[0]?.message?.content),
    SPEAKING_CRITERIA,
    'You completed the speaking task. Keep the pauses short and the linking words explicit.',
  );
  evaluation.transcript = transcript;

  const { error: updateError } = await supabase
    .from('speaking_attempts')
    .update({
      transcript,
      word_count: transcript.split(/\s+/).filter(Boolean).length,
      fluency: evaluation.scores.fluency ?? null,
      lexical_range: evaluation.scores.lexical_range ?? null,
      grammar_accuracy: evaluation.scores.grammar_accuracy ?? null,
      coherence: evaluation.scores.coherence ?? null,
      pronunciation: evaluation.scores.pronunciation ?? null,
      overall: evaluation.overall,
      feedback: { summary: evaluation.feedback, corrected: evaluation.corrected ?? null },
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      status: 'evaluated',
      ai_model: MODEL,
      evaluated_at: new Date().toISOString(),
    })
    .eq('id', attemptId)
    .eq('user_id', userId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  return NextResponse.json({ ok: true, kind: 'speaking', evaluation });
}

async function scoreWriting({
  groq,
  supabase,
  userId,
  submissionId,
}: {
  groq: Groq;
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;
  userId: string;
  submissionId: string;
}) {
  const { data: submission, error } = await supabase
    .from('writing_submissions')
    .select('id, body, task_id, lesson_id, word_count')
    .eq('id', submissionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!submission) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  if (!submission.body || submission.body.trim().length < 20) {
    return NextResponse.json({ error: 'The draft is too short to score' }, { status: 400 });
  }

  const task = submission.task_id
    ? (await supabase.from('writing_tasks').select('*').eq('id', submission.task_id).maybeSingle()).data as WritingTask | null
    : null;

  const systemPrompt = `You are a Cambridge CEFR B1-B2 writing examiner. Score the response against the five criteria, 0-100 each.
Be calibrated: 60 = borderline B1, 70 = solid B1, 80 = entering B2, 90 = solid B2.
Return strictly valid JSON with no markdown:
{"scores":{"task_response":0,"organisation":0,"grammar_accuracy":0,"lexical_range":0,"style":0},"overall":0,"feedback":"2-3 sentences","strengths":["..."],"improvements":["..."],"corrected":"a corrected version of the two weakest sentences"}`;

  const userPrompt = `Task: ${task?.prompt ?? 'General writing practice'}
Format: ${task?.format ?? 'short text'}; required length: ${task?.word_min ?? 120}-${task?.word_max ?? 180} words; submitted: ${submission.word_count ?? 'unknown'} words.

Draft:
"""
${submission.body}
"""`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1100,
    response_format: { type: 'json_object' },
  });

  const evaluation = buildEvaluation(
    parseJson(completion.choices[0]?.message?.content),
    WRITING_CRITERIA,
    'You submitted a draft. Check that every paragraph has one clear job.',
  );

  const { error: updateError } = await supabase
    .from('writing_submissions')
    .update({
      task_response: evaluation.scores.task_response ?? null,
      organisation: evaluation.scores.organisation ?? null,
      grammar_accuracy: evaluation.scores.grammar_accuracy ?? null,
      lexical_range: evaluation.scores.lexical_range ?? null,
      style: evaluation.scores.style ?? null,
      overall: evaluation.overall,
      feedback: { summary: evaluation.feedback, corrected: evaluation.corrected ?? null },
      corrections: { improvements: evaluation.improvements },
      status: 'evaluated',
      ai_model: MODEL,
      evaluated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('user_id', userId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  return NextResponse.json({ ok: true, kind: 'writing', evaluation });
}
