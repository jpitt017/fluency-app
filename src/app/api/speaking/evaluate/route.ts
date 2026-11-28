import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { requireUploadEpochForFencedRequest } from '@/lib/b1b2/deletion-generation.mjs';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { persistLearnerErrors } from '@/lib/b1b2/feedback-schema';
import { evaluateSpeakingTranscript } from '@/lib/b1b2/speaking-evaluation';
import { fluencyFromWhisper, soundTips } from '@/lib/b1b2/speaking-feedback.mjs';
import { logAiRequest } from '@/lib/b1b2/observability';
import { providerFailureResponse } from '@/lib/b1b2/provider-failure-response';
import { loadLearnerWeek } from '@/lib/curriculum/learner-week';
import { speakingSupportConfig } from '@/lib/curriculum/week-speaking-support';
import { recordWeekSubmission } from '@/lib/curriculum/week-models';
import { sanitizeLearnerText } from '@/lib/b1b2/prompt-guard';

const ENDPOINT = '/api/speaking/evaluate';
const MODEL_ID = 'openai/gpt-oss-20b';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 4000;

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
  let isSignedIn = false;
  const isAudio = (req.headers.get('content-type') || '').includes('multipart/form-data');

  try {
    if (isAudio) {
      try { await requireUploadEpochForFencedRequest(createAdminSupabase(), req.headers); }
      catch {
        statusCode = 409;
        return NextResponse.json({ error: 'Please refresh the page before recording again.' }, { status: 409 });
      }
    }
    let weekNumber: number | null = null;
    let grammarWeek: number | null = null;
    let transcript = '';
    let targetPhrase = '';
    let promptContext = '';
    let taskId = '';
    let lessonId = '';
    let audioPath = '';
    let mimeType = '';
    let audioFile: File | null = null;
    let fluency = null;

    if (isAudio) {
      const form = await req.formData();
      audioFile = form.get('audio') as File | null;
      const rawWeek = form.get('weekNumber');
      if (rawWeek && /^\d+$/.test(String(rawWeek))) weekNumber = Number(rawWeek);
      const rawGrammarWeek = Number(form.get('grammarWeek'));
      if (Number.isInteger(rawGrammarWeek) && rawGrammarWeek >= 1 && rawGrammarWeek <= 32) grammarWeek = rawGrammarWeek;
      targetPhrase = sanitizeLearnerText(form.get('targetPhrase'), 400).text;
      promptContext = sanitizeLearnerText(form.get('prompt'), 500).text;
      taskId = String(form.get('taskId') || '').trim();
      lessonId = String(form.get('lessonId') || '').trim();
      audioPath = String(form.get('audioPath') || '').trim();
      mimeType = String(form.get('mimeType') || audioFile?.type || '').trim();
      if (!audioFile || typeof audioFile.size !== 'number') {
        statusCode = 400;
        return NextResponse.json({ error: 'No audio file provided.' }, { status: 400 });
      }
      if (audioFile.size > MAX_AUDIO_BYTES) {
        statusCode = 413;
        return NextResponse.json({ error: 'Audio file exceeds the 10 MB limit.' }, { status: 413 });
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      transcript = sanitizeLearnerText(body.transcript, MAX_TRANSCRIPT_CHARS).text;
      targetPhrase = sanitizeLearnerText(body.targetPhrase, 400).text;
      promptContext = sanitizeLearnerText(body.prompt, 500).text;
      taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
      lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : '';
      audioPath = typeof body.audioPath === 'string' ? body.audioPath.trim() : '';
      mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : '';
    }

    const weekTask = weekNumber ? await loadLearnerWeek(weekNumber) : null;
    const weeklyTask = Boolean(isAudio && weekTask && weekNumber
      && promptContext === sanitizeLearnerText(weekTask.speakingPrompt, 500).text);
    // Dedicated weeks must use the saved-take route: a direct lab POST cannot
    // unlock the model or bypass their five-check ledger. Other published
    // weeks retain their existing lab-based completion flow.
    if (weeklyTask && weekNumber && speakingSupportConfig(weekNumber)) {
      statusCode = 409;
      return NextResponse.json({ error: `Record this weekly task on the Week ${weekNumber} page.` }, { status: 409 });
    }

    // Audio transcription and evaluation cost six units; typed text costs three.
    const guard = await enforceAiUsage(supabase, ENDPOINT, isAudio ? 6 : 3);
    isSignedIn = Boolean(guard.userId);
    if (!guard.allowed && guard.response) {
      statusCode = guard.response.status;
      return guard.response;
    }
    if (!process.env.GROQ_API_KEY) throw Object.assign(new Error('Speech service is not configured'), { status: 401 });
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    if (audioFile) {
      const transcription = await groq.audio.transcriptions.create({
        file: audioFile, model: 'whisper-large-v3-turbo', language: 'en',
        response_format: 'verbose_json', timestamp_granularities: ['segment'],
      });
      transcript = sanitizeLearnerText(transcription.text, MAX_TRANSCRIPT_CHARS).text;
      fluency = fluencyFromWhisper(transcript, transcription);
      audioSeconds = fluency.seconds ?? 0;
    }
    inputChars = transcript.length;
    if (!transcript) {
      statusCode = 400;
      return NextResponse.json({ error: 'Could not detect any speech in the recording. Please try speaking closer to the microphone.' }, { status: 400, headers: guard.headers });
    }

    const evaluation = await evaluateSpeakingTranscript({
      groq, supabase, transcript, prompt: promptContext, targetPhrase, weekNumber: grammarWeek ?? weekNumber,
    });
    const { validated, structure, cuePoints } = evaluation;
    cacheHit = evaluation.cacheHit;
    promptTokens = evaluation.promptTokens;
    completionTokens = evaluation.completionTokens;
    const uiCorrections = validated.corrections.map((c) => ({ ...c, alternative: c.corrected_sentence }));
    const sounds = soundTips(transcript);
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    let savedAttemptId: string | null = null;
    let newBadges: string[] = [];

    if (supabase && guard.userId) {
      if (taskId) {
        const { data: inserted, error: insertError } = await supabase.from('speaking_attempts').insert({
          user_id: guard.userId, task_id: taskId, lesson_id: lessonId || null,
          audio_path: audioPath || null, mime_type: mimeType || null,
          // The display keeps Whisper's fractional seconds, but the saved
          // speaking_attempts.duration_seconds column is an integer.
          duration_seconds: fluency?.seconds != null ? Math.max(1, Math.round(fluency.seconds)) : null,
          transcript, word_count: wordCount,
          fluency: validated.rubric.task_achievement, lexical_range: validated.rubric.lexical_range,
          grammar_accuracy: validated.rubric.grammar_accuracy, coherence: validated.rubric.coherence,
          pronunciation: null, overall: validated.score,
          feedback: { summary: validated.feedback, improvedResponse: validated.improvedResponse,
            tips: validated.tips, corrections: uiCorrections, errorPatterns: validated.errorPatterns,
            rubric: validated.rubric, structure, cuePoints, fluency, soundTips: sounds },
          strengths: validated.strengths, improvements: validated.improvements,
          status: 'evaluated', ai_model: MODEL_ID, evaluated_at: new Date().toISOString(),
        }).select('id').single();
        if (!insertError && inserted) {
          savedAttemptId = inserted.id;
          const { data: badgeCodes } = await supabase.rpc('evaluate_badges');
          if (Array.isArray(badgeCodes)) newBadges = badgeCodes.filter((c): c is string => typeof c === 'string');
        }
      }
      await persistLearnerErrors(supabase, {
        userId: guard.userId, sourceType: 'speaking', sourceId: savedAttemptId,
        lessonId: lessonId || null, sourceText: transcript, sourceWordCount: wordCount, corrections: validated.corrections,
      });
    }

    const modelAnswer = weeklyTask && guard.userId
      ? await recordWeekSubmission(guard.userId, weekNumber, 'speaking') : null;
    return NextResponse.json({
      modelAnswer, weekRecorded: weeklyTask ? Boolean(modelAnswer) : weekTask ? false : null, supportSaved: null,
      attemptId: savedAttemptId, transcript, improvedResponse: validated.improvedResponse,
      feedback: validated.feedback, strengths: validated.strengths, improvements: validated.improvements,
      corrections: uiCorrections, errorPatterns: validated.errorPatterns, tips: validated.tips,
      rubric: validated.rubric, score: validated.score, structure, cuePoints, fluency, soundTips: sounds,
      transcriptionNote: 'The AI reads what you said and checks your ideas, grammar and words. Sound practice is not a pronunciation score.',
      newBadges, cached: cacheHit,
    }, { headers: guard.headers });
  } catch (err: unknown) {
    const failure = await providerFailureResponse({
      admin: supabase, endpoint: ENDPOINT, model: MODEL_ID, error: err,
      workSaved: false, workKind: isAudio ? 'recording' : 'text',
    });
    statusCode = failure.status;
    errorMessage = failure.errorMessage;
    return failure.response;
  } finally {
    await logAiRequest(supabase, {
      endpoint: ENDPOINT, model: MODEL_ID, statusCode, latencyMs: Date.now() - startedAt,
      cacheHit, audioSeconds, inputChars, promptTokens, completionTokens, errorMessage,
    }, isSignedIn);
  }
}
