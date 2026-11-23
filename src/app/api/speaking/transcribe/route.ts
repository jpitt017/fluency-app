import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/b1b2/transcription';
import { createServerSupabase } from '@/utils/supabase/server';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { logAiRequest } from '@/lib/b1b2/observability';
import { providerFailureResponse } from '@/lib/b1b2/provider-failure-response';

// Transcription only: no speaking rubric, no corrections. Costs 2 units vs 6 for /api/speaking/evaluate.
const QUOTA_ENDPOINT = '/api/speaking/evaluate';
const LOG_ENDPOINT = '/api/speaking/transcribe';
const MODEL_ID = 'whisper-large-v3-turbo';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const supabase = await createServerSupabase();
  let statusCode = 200;
  let audioSeconds = 0;
  let errorMessage: string | null = null;

  try {
    const guard = await enforceAiUsage(supabase, QUOTA_ENDPOINT, 2);
    if (!guard.allowed && guard.response) {
      statusCode = guard.response.status;
      return guard.response;
    }

    const formData = await req.formData();
    const audio = formData.get('audio') as File | null;
    if (!audio) {
      statusCode = 400;
      return NextResponse.json({ error: 'No audio file provided.' }, { status: 400, headers: guard.headers });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      statusCode = 413;
      return NextResponse.json({ error: 'Audio file exceeds the 10 MB limit.' }, { status: 413, headers: guard.headers });
    }

    const transcript = await transcribeAudio(audio);
    audioSeconds = Math.max(1, Math.round(audio.size / 16000));

    if (!transcript) {
      statusCode = 400;
      return NextResponse.json(
        { error: 'No speech was detected. Please try again or type your response.' },
        { status: 400, headers: guard.headers },
      );
    }

    return NextResponse.json({ transcript, transcribeOnly: true, units: 2 }, { headers: guard.headers });
  } catch (error) {
    // The audio arrived with this request and is not stored, so there is nothing
    // to retry from: the learner has to keep their recording.
    const failure = await providerFailureResponse({
      admin: supabase,
      endpoint: LOG_ENDPOINT,
      model: MODEL_ID,
      error,
      workSaved: false,
      workKind: 'recording',
    });
    statusCode = failure.status;
    errorMessage = failure.errorMessage;
    return failure.response;
  } finally {
    await logAiRequest(supabase, {
      endpoint: LOG_ENDPOINT,
      model: MODEL_ID,
      statusCode,
      latencyMs: Date.now() - startedAt,
      cacheHit: false,
      audioSeconds,
      inputChars: 0,
      promptTokens: 0,
      completionTokens: 0,
      errorMessage,
    });
  }
}
