import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { buildEvalCacheKey, readEvalCache, writeEvalCache } from '@/lib/b1b2/eval-cache';
import {
  buildSpeakingSystemPrompt,
  persistLearnerErrors,
  validateSpeakingFeedback,
  type SpeakingFeedback,
} from '@/lib/b1b2/feedback-schema';
import { createGroqJsonCompletion } from '@/lib/b1b2/groq-json';
import { logAiRequest } from '@/lib/b1b2/observability';
import { sanitizeLearnerText, wrapLearnerSubmission } from '@/lib/b1b2/prompt-guard';

const ENDPOINT = '/api/speaking/evaluate';
const MODEL_ID = 'openai/gpt-oss-20b';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 4000;

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return new Groq({ apiKey });
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const supabase = await createServerSupabase();
  let statusCode = 200;
  let cacheHit = false;
  let audioSeconds = 0;
  let inputChars = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let errorMessage: string | null = null;

  try {
    const contentType = req.headers.get('content-type') || '';
    const isAudio = contentType.includes('multipart/form-data');

    // Speaking with Whisper audio transcription costs 6 units vs 3 for text-only (writing = 2)
    const guard = await enforceAiUsage(supabase, ENDPOINT, isAudio ? 6 : 3);
    if (!guard.allowed && guard.response) {
      statusCode = guard.response.status;
      return guard.response;
    }

    let groq: Groq;
    try {
      groq = getGroqClient();
    } catch (err: unknown) {
      statusCode = 503;
      errorMessage = err instanceof Error ? err.message : 'Groq API is not configured on the server';
      return NextResponse.json({ error: errorMessage }, { status: 503, headers: guard.headers });
    }

    let transcript = '';
    let targetPhrase = '';
    let promptContext = '';
    let taskId = '';
    let lessonId = '';
    let audioPath = '';
    let mimeType = '';
    let durationSeconds = 0;

    if (isAudio) {
      const formData = await req.formData();
      const audioFile = formData.get('audio') as File | null;
      targetPhrase = sanitizeLearnerText(formData.get('targetPhrase'), 400).text;
      promptContext = sanitizeLearnerText(formData.get('prompt'), 500).text;
      taskId = String(formData.get('taskId') || '').trim();
      lessonId = String(formData.get('lessonId') || '').trim();
      audioPath = String(formData.get('audioPath') || '').trim();
      mimeType = String(formData.get('mimeType') || audioFile?.type || '').trim();
      durationSeconds = Number(formData.get('durationSeconds')) || 0;

      if (!audioFile) {
        statusCode = 400;
        return NextResponse.json(
          { error: 'No audio file provided.' },
          { status: 400, headers: guard.headers },
        );
      }

      if (audioFile.size > MAX_AUDIO_BYTES) {
        statusCode = 413;
        return NextResponse.json(
          { error: 'Audio file exceeds the 10 MB limit.' },
          { status: 413, headers: guard.headers },
        );
      }

      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-large-v3-turbo',
        language: 'en',
        response_format: 'json',
      });

      transcript = sanitizeLearnerText(transcription.text, MAX_TRANSCRIPT_CHARS).text;
      audioSeconds = durationSeconds > 0 ? durationSeconds : Math.max(1, Math.round(audioFile.size / 16000));
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      transcript = sanitizeLearnerText(body.transcript, MAX_TRANSCRIPT_CHARS).text;
      targetPhrase = sanitizeLearnerText(body.targetPhrase, 400).text;
      promptContext = sanitizeLearnerText(body.prompt, 500).text;
      taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
      lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : '';
      audioPath = typeof body.audioPath === 'string' ? body.audioPath.trim() : '';
      mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : '';
      durationSeconds = Number(body.durationSeconds) || 0;
    }

    inputChars = transcript.length;
    if (!transcript) {
      statusCode = 400;
      return NextResponse.json(
        { error: 'Could not detect any speech in the recording. Please try speaking closer to the microphone.' },
        { status: 400, headers: guard.headers },
      );
    }

    const cacheKey = buildEvalCacheKey({
      endpoint: ENDPOINT,
      model: MODEL_ID,
      prompt: `${promptContext}|${targetPhrase}`,
      input: transcript,
      variety: 'British',
    });

    let validated: SpeakingFeedback | null = null;
    const cachedRaw = await readEvalCache<Record<string, unknown>>(supabase, cacheKey);
    if (cachedRaw) {
      try {
        validated = validateSpeakingFeedback(cachedRaw, transcript);
        cacheHit = true;
      } catch {
        validated = null;
      }
    }

    if (!validated) {
      const systemPrompt = buildSpeakingSystemPrompt();
      const userPrompt = `Context/Prompt: ${promptContext || 'General B1 → B2 speaking practice'}
Target Language: ${targetPhrase || 'None'}

${wrapLearnerSubmission(transcript)}`;

      const evaluation = await createGroqJsonCompletion(groq, {
        model: MODEL_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.25,
        maxCompletionTokens: 4096,
      });

      promptTokens = evaluation.promptTokens;
      completionTokens = evaluation.completionTokens;

      validated = validateSpeakingFeedback(evaluation.parsed, transcript);

      await writeEvalCache(supabase, {
        cacheKey,
        endpoint: ENDPOINT,
        model: MODEL_ID,
        response: validated,
      });
    }

    const uiCorrections = validated.corrections.map((c) => ({
      original: c.original,
      corrected_sentence: c.corrected_sentence,
      alternative: c.corrected_sentence,
      error_category: c.error_category,
      other_label: c.other_label,
      explanation: c.explanation,
      severity: c.severity,
      rule: c.rule,
    }));

    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    let savedAttemptId: string | null = null;
    let newBadges: string[] = [];

    if (supabase && guard.userId) {
      if (taskId) {
        const { data: inserted, error: insertError } = await supabase
          .from('speaking_attempts')
          .insert({
            user_id: guard.userId,
            task_id: taskId,
            lesson_id: lessonId || null,
            audio_path: audioPath || null,
            mime_type: mimeType || null,
            duration_seconds: durationSeconds || null,
            transcript,
            word_count: wordCount,
            fluency: validated.rubric.task_achievement,
            lexical_range: validated.rubric.lexical_range,
            grammar_accuracy: validated.rubric.grammar_accuracy,
            coherence: validated.rubric.coherence,
            pronunciation: null,
            overall: validated.score,
            feedback: {
              summary: validated.feedback,
              improvedResponse: validated.improvedResponse,
              tips: validated.tips,
              corrections: uiCorrections,
              errorPatterns: validated.errorPatterns,
              rubric: validated.rubric,
              pronunciationNote:
                'Transcript feedback evaluates content, grammar, vocabulary, and coherence. Use the Shadowing Lab to compare your pronunciation directly with native audio.',
            },
            strengths: validated.strengths,
            improvements: validated.improvements,
            status: 'evaluated',
            ai_model: MODEL_ID,
            evaluated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (!insertError && inserted) {
          savedAttemptId = inserted.id;
          const { data: badgeCodes } = await supabase.rpc('evaluate_badges');
          if (Array.isArray(badgeCodes)) {
            newBadges = badgeCodes.filter((c): c is string => typeof c === 'string');
          }
        }
      }

      await persistLearnerErrors(supabase, {
        userId: guard.userId,
        sourceType: 'speaking',
        sourceId: savedAttemptId,
        lessonId: lessonId || null,
        sourceText: transcript,
        sourceWordCount: wordCount,
        corrections: validated.corrections,
      });
    }

    return NextResponse.json(
      {
        attemptId: savedAttemptId,
        transcript,
        improvedResponse: validated.improvedResponse,
        feedback: validated.feedback,
        strengths: validated.strengths,
        improvements: validated.improvements,
        corrections: uiCorrections,
        errorPatterns: validated.errorPatterns,
        tips: validated.tips,
        rubric: validated.rubric,
        score: validated.score,
        transcriptionNote:
          'Evaluated from your spoken transcript (content, grammar, vocabulary & coherence). Use the Listen-and-Compare Shadowing Lab below to practise pronunciation.',
        newBadges,
        cached: cacheHit,
      },
      { headers: guard.headers },
    );
  } catch (err: unknown) {
    statusCode = 500;
    errorMessage = err instanceof Error ? err.message : 'Failed to evaluate speaking submission';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
    await logAiRequest(supabase, {
      endpoint: ENDPOINT,
      model: MODEL_ID,
      statusCode,
      latencyMs: Date.now() - startedAt,
      cacheHit,
      audioSeconds,
      inputChars,
      promptTokens,
      completionTokens,
      errorMessage,
    });
  }
}
