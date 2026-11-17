import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return new Groq({ apiKey });
}

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB limit

export async function POST(req: NextRequest) {
  let groq: Groq;

  try {
    groq = getGroqClient();
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Groq API is not configured on the server' },
      { status: 500 }
    );
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let transcript = '';
    let targetPhrase = '';
    let promptContext = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const audioFile = formData.get('audio') as File | null;
      targetPhrase = String(formData.get('targetPhrase') || '');
      promptContext = String(formData.get('prompt') || '');

      if (!audioFile) {
        return NextResponse.json(
          { error: 'No audio file provided.' },
          { status: 400 }
        );
      }

      if (audioFile.size > MAX_AUDIO_BYTES) {
        return NextResponse.json(
          { error: 'Audio file exceeds the 10 MB limit.' },
          { status: 413 }
        );
      }

      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-large-v3-turbo',
        language: 'en',
        response_format: 'json',
      });

      transcript = (transcription.text || '').trim();
    } else {
      const body = await req.json().catch(() => ({}));
      transcript = String(body.transcript || '').trim();
      targetPhrase = String(body.targetPhrase || '');
      promptContext = String(body.prompt || '');
    }

    if (!transcript) {
      return NextResponse.json(
        { error: 'Could not detect any speech in the recording. Please try speaking closer to the microphone.' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a Cambridge CEFR B1 British English speaking examiner.
Evaluate the student's spoken transcript for fluency, grammar, and natural British English phrasing.
Return strictly valid JSON with no markdown fences:
{
  "transcript": "string",
  "naturalBritishVersion": "string",
  "feedback": "string (2-3 encouraging sentences)",
  "tips": ["string"],
  "score": 82
}`;

    const userPrompt = `Context/Prompt: ${promptContext || 'General B1 speaking practice'}
Target Phrase: ${targetPhrase || 'None'}
Transcribed Speech: "${transcript}"`;

    const evaluation = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    });

    const rawEval = evaluation.choices[0]?.message?.content;
    if (!rawEval) {
      return NextResponse.json({
        transcript,
        naturalBritishVersion: transcript,
        feedback: 'Clear speech detected! Keep practising natural British rhythm and stress.',
        tips: [],
        score: 75,
      });
    }

    const parsed = JSON.parse(rawEval);
    return NextResponse.json({
      transcript,
      naturalBritishVersion: parsed.naturalBritishVersion || transcript,
      feedback: parsed.feedback || 'Well done on completing the speaking exercise.',
      tips: Array.isArray(parsed.tips) ? parsed.tips : [],
      score: typeof parsed.score === 'number' ? parsed.score : 78,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to evaluate speaking submission' },
      { status: 500 }
    );
  }
}