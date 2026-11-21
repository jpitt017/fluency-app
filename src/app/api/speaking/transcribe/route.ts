import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { logAiRequest } from '@/lib/b1b2/observability';
import { sanitizeLearnerText } from '@/lib/b1b2/prompt-guard';

// Transcription only: no speaking rubric, no corrections. Costs 2 units vs 6 for /api/speaking/evaluate.
const QUOTA_ENDPOINT = '/api/speaking/evaluate';
const LOG_ENDPOINT = '/api/speaking/transcribe';
const MODEL_ID = 'whisper-large-v3-turbo';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 4000;

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

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      statusCode = 503;
      errorMessage = 'GROQ_API_KEY is not configured';
      return NextResponse.json({ error: errorMessage }, { status: 503, headers: guard.headers });
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

    const transcription = await new Groq({ apiKey }).audio.transcriptions.create({
      file: audio,
      model: MODEL_ID,
      language: 'en',
      response_format: 'json',
    });
    const transcript = sanitizeLearnerText(transcription.text, MAX_TRANSCRIPT_CHARS).text;
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
    statusCode = 500;
    errorMessage = error instanceof Error ? error.message : 'Transcription failed';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
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
