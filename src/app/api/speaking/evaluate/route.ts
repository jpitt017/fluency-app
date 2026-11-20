import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import {
  buildSpeakingSystemPrompt,
  persistLearnerErrors,
  validateSpeakingFeedback,
  type SpeakingFeedback,
} from '@/lib/b1b2/feedback-schema';
import { buildEvalCacheKey, readEvalCache, writeEvalCache } from '@/lib/b1b2/eval-cache';

const MODEL_ID = 'openai/gpt-oss-20b';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return new Groq({ apiKey });
}

export async function POST(req: NextRequest) {
  let groq: Groq;

  try {
    groq = getGroqClient();
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Groq API is not configured on the server' },
      { status: 503 },
    );
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let transcript = '';
    let targetPhrase = '';
    let promptContext = '';
    let taskId = '';
    let lessonId = '';
    let audioPath = '';
    let mimeType = '';
    let durationSeconds = 0;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const audioFile = formData.get('audio') as File | null;
      targetPhrase = String(formData.get('targetPhrase') || '');
      promptContext = String(formData.get('prompt') || '');
      taskId = String(formData.get('taskId') || '').trim();
      lessonId = String(formData.get('lessonId') || '').trim();
      audioPath = String(formData.get('audioPath') || '').trim();
      mimeType = String(formData.get('mimeType') || audioFile?.type || '').trim();
      durationSeconds = Number(formData.get('durationSeconds')) || 0;

      if (!audioFile) {
        return NextResponse.json({ error: 'No audio file provided.' }, { status: 400 });
      }

      if (audioFile.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: 'Audio file exceeds the 10 MB limit.' }, { status: 413 });
      }

      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-large-v3-turbo',
        language: 'en',
        response_format: 'json',
      });

      transcript = (transcription.text || '').trim();
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      transcript = String(body.transcript || '').trim();
      targetPhrase = String(body.targetPhrase || '');
      promptContext = String(body.prompt || '');
      taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
      lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : '';
      audioPath = typeof body.audioPath === 'string' ? body.audioPath.trim() : '';
      mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : '';
      durationSeconds = Number(body.durationSeconds) || 0;
    }

    if (!transcript) {
      return NextResponse.json(
        { error: 'Could not detect any speech in the recording. Please try speaking closer to the microphone.' },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabase();
    const cacheKey = buildEvalCacheKey({
      endpoint: '/api/speaking/evaluate',
      model: MODEL_ID,
      prompt: `${promptContext}|${targetPhrase}`,
      input: transcript,
      variety: 'British',
    });

    let validated: SpeakingFeedback | null = null;
    let cacheHit = false;

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
Transcribed Speech: "${transcript}"`;

      const evaluation = await groq.chat.completions.create({
        model: MODEL_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 950,
        response_format: { type: 'json_object' },
      });

      const rawEval = evaluation.choices[0]?.message?.content;
      const parsed = rawEval ? (JSON.parse(rawEval) as unknown) : {};
      validated = validateSpeakingFeedback(parsed, transcript);

      await writeEvalCache(supabase, {
        cacheKey,
        endpoint: '/api/speaking/evaluate',
        model: MODEL_ID,
        response: validated,
      });
    }

    const uiCorrections = validated.corrections.map((c) => ({
      original: c.original,
      corrected_sentence: c.corrected_sentence,
      alternative: c.corrected_sentence,
      error_category: c.error_category,
      explanation: c.explanation,
      severity: c.severity,
      rule: c.rule,
    }));

    let savedAttemptId: string | null = null;
    let newBadges: string[] = [];

    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        if (taskId) {
          const wordCount = transcript.split(/\s+/).filter(Boolean).length;
          const { data: inserted, error: insertError } = await supabase
            .from('speaking_attempts')
            .insert({
              user_id: user.id,
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
          userId: user.id,
          sourceType: 'speaking',
          sourceId: savedAttemptId,
          lessonId: lessonId || null,
          corrections: validated.corrections,
        });
      }
    }

    return NextResponse.json({
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
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to evaluate speaking submission' },
      { status: 500 },
    );
  }
}
