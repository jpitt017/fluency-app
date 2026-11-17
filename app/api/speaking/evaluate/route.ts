import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { checkRateLimit } from '@/utils/ratelimit';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    // 1. Rate Limiting Check (by IP or proxy header)
    const identifier = req.headers.get('x-forwarded-for') || 'anonymous-user';
    const { success, retryAfter } = checkRateLimit(identifier);

    if (!success) {
      return NextResponse.json(
        { error: `Too many requests. Please try again in ${retryAfter} seconds.` },
        { 
          status: 429,
          headers: { 'Retry-After': String(retryAfter) }
        }
      );
    }

    // 2. Parse FormData
    const formData = (await req.formData()) as any;
    const audioFile = formData.get('audio') as File;
    const sessionTitle = formData.get('sessionTitle') || 'B1 Session';
    const pronunciationFocus = formData.get('pronunciationFocus') || '';

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided in FormData.' },
        { status: 400 }
      );
    }

    // Cost Control: Restrict maximum audio file size (e.g. ~10MB max)
    if (audioFile.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Audio file is too large. Please keep recordings under 60 seconds.' },
        { status: 400 }
      );
    }

    // 3. Transcribe audio using Groq Whisper model
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
      prompt: `B1 British English speaking practice for session: ${sessionTitle}`,
      response_format: 'json',
    });

    const transcriptText = transcription.text || '';

    // 4. Evaluate transcript via Groq LLM (with token budget limit)
    const chatCompletion = await groq.chat.completions.create({
      model: process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b',
      temperature: 0.3,
      max_tokens: 300, // Cost control: limit response tokens
      messages: [
        {
          role: 'system',
          content: `You are an expert B1 British English speaking coach. Evaluate the learner's transcript for grammar, vocabulary, and natural UK expression. Provide constructive, encouraging feedback.`,
        },
        {
          role: 'user',
          content: `Session: ${sessionTitle}\nPronunciation/Focus: ${pronunciationFocus}\nTranscript: "${transcriptText}"`,
        },
      ],
    });

    const evaluation =
      chatCompletion.choices[0]?.message?.content ||
      'Good effort! Keep practising your natural phrasing.';

    return NextResponse.json({
      transcript: transcriptText,
      evaluation: evaluation,
    });
  } catch (err: any) {
    console.error('Error in /api/speaking/evaluate:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to evaluate audio recording.' },
      { status: 500 }
    );
  }
}