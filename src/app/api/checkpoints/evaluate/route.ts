import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { logAiRequest } from '@/lib/b1b2/observability';
import {
  sanitizeLearnerText,
  UNTRUSTED_DATA_SYSTEM_RULE,
  wrapLearnerSubmission,
} from '@/lib/b1b2/prompt-guard';

const ENDPOINT = '/api/checkpoints/evaluate';
const MODEL_ID = 'openai/gpt-oss-20b';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 5000;
const RECORDING_BUCKET = 'speaking-recordings';

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const supabase = await createServerSupabase();
  let statusCode = 200;
  let audioSeconds = 0;
  let inputChars = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let errorMessage: string | null = null;

  let recording: File | null = null;
  let transcript = '';
  let moduleNumber = 0;
  let objectiveId = '';
  let durationSeconds = 0;

  try {
    const contentType = request.headers.get('content-type') ?? '';
    const isAudio = contentType.includes('multipart/form-data');

    // Audio checkpoint evaluation charges 8 units vs 4 for transcript-only
    const guard = await enforceAiUsage(supabase, ENDPOINT, isAudio ? 8 : 4);
    if (!guard.allowed && guard.response) {
      statusCode = guard.response.status;
      return guard.response;
    }
    if (!supabase || !guard.userId) {
      statusCode = 401;
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (isAudio) {
      const form = await request.formData();
      recording = form.get('audio') instanceof File ? (form.get('audio') as File) : null;
      transcript = sanitizeLearnerText(form.get('transcript'), MAX_TRANSCRIPT_CHARS).text;
      moduleNumber = Number(form.get('moduleNumber'));
      objectiveId = sanitizeLearnerText(form.get('objectiveId'), 120).text;
      durationSeconds = Number(form.get('durationSeconds')) || 0;
      if (recording && recording.size > MAX_AUDIO_BYTES) {
        statusCode = 413;
        return NextResponse.json(
          { error: 'Audio file exceeds the 10 MB limit.' },
          { status: 413, headers: guard.headers },
        );
      }
    } else {
      const body = await request.json().catch(() => ({}));
      transcript = sanitizeLearnerText(body.transcript, MAX_TRANSCRIPT_CHARS).text;
      moduleNumber = Number(body.moduleNumber);
      objectiveId = sanitizeLearnerText(body.objectiveId, 120).text;
      durationSeconds = Number(body.durationSeconds) || 0;
    }

    if (!Number.isInteger(moduleNumber) || moduleNumber < 1 || moduleNumber > 16) {
      statusCode = 400;
      return NextResponse.json(
        { error: 'A valid week/module number (1–16) is required.' },
        { status: 400, headers: guard.headers },
      );
    }

    const { data: mod, error: modError } = await supabase
      .from('modules')
      .select('id, title, grammar_focus')
      .eq('module_number', moduleNumber)
      .maybeSingle();

    if (modError || !mod) {
      statusCode = 404;
      return NextResponse.json({ error: 'Module not found.' }, { status: 404, headers: guard.headers });
    }

    const { data: speakingTask } = await supabase
      .from('speaking_tasks')
      .select('id, title, prompt')
      .eq('module_id', mod.id)
      .order('target_seconds', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!speakingTask) {
      statusCode = 404;
      return NextResponse.json(
        { error: 'Speaking task not found for this module.' },
        { status: 404, headers: guard.headers },
      );
    }

    if (!recording && transcript.split(/\s+/).filter(Boolean).length < 20) {
      statusCode = 400;
      return NextResponse.json(
        { error: 'Provide an audio recording or a transcript of at least 20 words.' },
        { status: 400, headers: guard.headers },
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      statusCode = 503;
      return NextResponse.json(
        { error: 'Checkpoint assessor is not configured.' },
        { status: 503, headers: guard.headers },
      );
    }
    const groq = new Groq({ apiKey });

    if (recording) {
      const transcription = await groq.audio.transcriptions.create({
        file: recording,
        model: 'whisper-large-v3-turbo',
        language: 'en',
        response_format: 'json',
      });
      transcript = sanitizeLearnerText(transcription.text, MAX_TRANSCRIPT_CHARS).text;
      audioSeconds = durationSeconds > 0 ? durationSeconds : Math.max(1, Math.round(recording.size / 16000));
      if (transcript.split(/\s+/).filter(Boolean).length < 20) {
        statusCode = 400;
        return NextResponse.json(
          { error: 'We could not detect enough speech. Please try a longer, clearer recording.' },
          { status: 400, headers: guard.headers },
        );
      }
      if (!durationSeconds) durationSeconds = audioSeconds;
    }

    inputChars = transcript.length;
    const words = transcript.match(/[\p{L}'’-]+/gu) ?? [];
    const wpm = durationSeconds > 0 ? Math.round((words.length / durationSeconds) * 60) : null;
    const fillers = transcript.match(/\b(er|um|uh|like|you know)\b/gi) ?? [];
    const grammarFocus = Array.isArray(mod.grammar_focus) ? mod.grammar_focus : [];

    const prompt = `Assess this English B1 → B2 checkpoint against the module task below.
Module ${moduleNumber}: ${mod.title}
Task (${objectiveId || speakingTask.title}): ${speakingTask.prompt}
Target grammar: ${grammarFocus.join(', ')}

${wrapLearnerSubmission(transcript)}

Return JSON with numeric 0-100 fields taskAchievement, grammarControl, lexicalRange, fluency, targetStructureHitRate; reviewDeck as 3-5 concise targeted practice items; summary as one sentence in clear B1 British English.`;

    const completion = await groq.chat.completions.create({
      model: MODEL_ID,
      messages: [
        {
          role: 'system',
          content: `You are a fair, evidence-based CEFR B1 to B2 speaking assessor. Score only what is observable in the transcript (never guess pronunciation). Return strict JSON.\n\n${UNTRUSTED_DATA_SYSTEM_RULE}`,
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    promptTokens = completion.usage?.prompt_tokens ?? 0;
    completionTokens = completion.usage?.completion_tokens ?? 0;

    const evaluation = JSON.parse(completion.choices[0]?.message?.content || '{}') as Record<string, unknown>;
    const score = (name: string) => Math.max(0, Math.min(100, Number(evaluation[name]) || 0));
    const scores = [score('taskAchievement'), score('grammarControl'), score('lexicalRange'), score('fluency')];
    const structureHitRate = score('targetStructureHitRate');
    const passed = scores.every((value) => value >= 60) && structureHitRate >= 50;
    const fillerFrequency = words.length ? fillers.length / words.length : 0;
    const mastery = passed ? 100 : Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
    const rubric = {
      taskAchievement: scores[0],
      grammarControl: scores[1],
      lexicalRange: scores[2],
      fluency: scores[3],
      targetStructureHitRate: structureHitRate,
      wpm,
      fillerFrequency,
      summary: String(evaluation.summary ?? ''),
    };
    const reviewDeck = Array.isArray(evaluation.reviewDeck)
      ? evaluation.reviewDeck.filter((item: unknown): item is string => typeof item === 'string').slice(0, 5)
      : [];

    let recordingPath: string | null = null;
    if (recording) {
      recordingPath = `${guard.userId}/module-${moduleNumber}/${crypto.randomUUID()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from(RECORDING_BUCKET)
        .upload(recordingPath, recording, { contentType: recording.type || 'audio/webm', upsert: false });
      if (uploadError) throw new Error(`Could not save your recording: ${uploadError.message}`);
    }

    const scale5 = (pct: number) => Number(((pct / 100) * 5).toFixed(1));
    const { data: attempt, error: insertError } = await supabase
      .from('speaking_attempts')
      .insert({
        user_id: guard.userId,
        task_id: speakingTask.id,
        audio_path: recordingPath,
        mime_type: recording?.type || null,
        duration_seconds: durationSeconds || null,
        transcript,
        word_count: words.length,
        fluency: scale5(scores[3]),
        lexical_range: scale5(scores[2]),
        grammar_accuracy: scale5(scores[1]),
        coherence: scale5(scores[0]),
        pronunciation: null,
        overall: mastery,
        feedback: { ...rubric, reviewDeck, objectiveId },
        improvements: reviewDeck,
        status: 'evaluated',
        ai_model: MODEL_ID,
        evaluated_at: new Date().toISOString(),
      })
      .select('id, transcript, overall, feedback, audio_path, created_at')
      .single();

    if (insertError) throw insertError;

    const { data: checkpoint } = await supabase
      .from('checkpoints')
      .select('id')
      .eq('module_id', mod.id)
      .maybeSingle();

    if (checkpoint) {
      await supabase.from('checkpoint_attempts').insert({
        user_id: guard.userId,
        checkpoint_id: checkpoint.id,
        status: 'evaluated',
        speaking_attempt_id: attempt.id,
        scores: rubric,
        result: { passed, mastery, objectiveId },
        completed_at: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { attempt, passed, mastery, rubric, reviewDeck, transcript },
      { headers: guard.headers },
    );
  } catch (error) {
    statusCode = 500;
    errorMessage = error instanceof Error ? error.message : 'Checkpoint evaluation failed';
    console.error('Checkpoint evaluation failed:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
    await logAiRequest(supabase, {
      endpoint: ENDPOINT,
      model: MODEL_ID,
      statusCode,
      latencyMs: Date.now() - startedAt,
      audioSeconds,
      inputChars,
      promptTokens,
      completionTokens,
      errorMessage,
    });
  }
}
