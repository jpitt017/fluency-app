import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return new Groq({ apiKey });
}

interface GenerateLessonBody {
  sessionNumber?: number;
  topic?: string;
  grammarFocus?: string;
  vocabularyTheme?: string;
}

export async function POST(req: NextRequest) {
  let groq: Groq;

  try {
    groq = getGroqClient();
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server configuration error' },
      { status: 500 },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as GenerateLessonBody;
    const {
      sessionNumber = 1,
      topic = 'Everyday B1 → B2 Communication',
      grammarFocus = 'Present Perfect vs. Past Simple',
      vocabularyTheme = 'Work, Routines & Change',
    } = body;

    const systemPrompt = `You are a CEFR B1 → B2 curriculum designer.
Generate a structured, practical B1 → B2 English study unit matching the 5-block daily flow.
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

    const userPrompt = `Create B1 → B2 English Lesson ${sessionNumber}:
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
      return NextResponse.json({ error: 'Empty response from AI lesson generator' }, { status: 502 });
    }

    const lessonContent = JSON.parse(rawContent) as Record<string, unknown>;
    return NextResponse.json({ lesson: lessonContent });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate lesson' },
      { status: 500 },
    );
  }
}
