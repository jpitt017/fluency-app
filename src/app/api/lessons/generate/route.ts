import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase admin environment variables are not configured');
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return new Groq({ apiKey });
}

interface GenerateLessonBody {
  moduleId?: string;
  sessionNumber?: number;
  topic?: string;
  grammarFocus?: string;
  vocabularyTheme?: string;
  saveToDb?: boolean;
}

export async function POST(req: NextRequest) {
  let supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  let groq: Groq;

  try {
    supabaseAdmin = getSupabaseAdmin();
    groq = getGroqClient();
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Server configuration error' },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as GenerateLessonBody;
    const {
      moduleId,
      sessionNumber = 1,
      topic = 'Everyday British English Communication',
      grammarFocus = 'Present Perfect vs. Past Simple',
      vocabularyTheme = 'Workplace & Daily Life in the UK',
      saveToDb = false,
    } = body;

    const systemPrompt = `You are a Cambridge-certified British English (CEFR B1) curriculum designer.
Generate a structured, engaging B1 British English lesson using natural UK spelling (e.g., colour, organise, programme, flat, underground, queue).
Return strictly valid JSON with no markdown fences and the following schema:
{
  "title": "string",
  "summary": "string",
  "dialogue": [
    { "speaker": "string", "line": "string" }
  ],
  "vocabulary": [
    { "term": "string", "definition": "string", "example": "string" }
  ],
  "grammarNotes": {
    "rule": "string",
    "examples": ["string"]
  },
  "quiz": {
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "correctIndex": 0
  },
  "writingScaffold": {
    "prompt": "string",
    "targetKeywords": ["string", "string", "string"]
  },
  "targetDrillPhrase": "string"
}`;

    const userPrompt = `Create B1 British English Session ${sessionNumber}:
- Topic: ${topic}
- Grammar Focus: ${grammarFocus}
- Vocabulary Theme: ${vocabularyTheme}`;

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.6,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      return NextResponse.json(
        { error: 'Empty response from AI lesson generator' },
        { status: 502 }
      );
    }

    const lessonContent = JSON.parse(rawContent);

    if (saveToDb && moduleId) {
      const { data: savedSession, error: dbError } = await supabaseAdmin
        .from('sessions')
        .insert({
          module_id: moduleId,
          session_number: sessionNumber,
          title: lessonContent.title || topic,
          content: lessonContent,
        })
        .select()
        .single();

      if (dbError) {
        return NextResponse.json(
          {
            error: `Generated lesson but failed to save: ${dbError.message}`,
            lesson: lessonContent,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ session: savedSession, lesson: lessonContent });
    }

    return NextResponse.json({ lesson: lessonContent });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to generate lesson' },
      { status: 500 }
    );
  }
}