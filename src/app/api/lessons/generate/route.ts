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

const ENDPOINT = '/api/lessons/generate';
const MODEL_ID = 'openai/gpt-oss-20b';

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
  const startedAt = Date.now();
  const supabase = await createServerSupabase();
  let statusCode = 200;
  let inputChars = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let errorMessage: string | null = null;

  try {
    const guard = await enforceAiUsage(supabase, ENDPOINT, 5);
    if (!guard.allowed && guard.response) {
      statusCode = guard.response.status;
      return guard.response;
    }

    let groq: Groq;
    try {
      groq = getGroqClient();
    } catch (err: unknown) {
      statusCode = 503;
      errorMessage = err instanceof Error ? err.message : 'Server configuration error';
      return NextResponse.json({ error: errorMessage }, { status: 503, headers: guard.headers });
    }

    const body = (await req.json().catch(() => ({}))) as GenerateLessonBody;
    const sessionNumber = Number(body.sessionNumber) || 1;
    const topic = sanitizeLearnerText(body.topic || 'Everyday B1 → B2 Communication', 200).text;
    const grammarFocus = sanitizeLearnerText(
      body.grammarFocus || 'Present Perfect vs. Past Simple',
      200,
    ).text;
    const vocabularyTheme = sanitizeLearnerText(
      body.vocabularyTheme || 'Work, Routines & Change',
      200,
    ).text;
    inputChars = topic.length + grammarFocus.length + vocabularyTheme.length;

    const systemPrompt = `You are a CEFR B1 → B2 curriculum designer.
Generate a structured, practical B1 → B2 English study unit matching the 5-block daily flow.
${UNTRUSTED_DATA_SYSTEM_RULE}
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
${wrapLearnerSubmission(`Topic: ${topic}\nGrammar Focus: ${grammarFocus}\nVocabulary Theme: ${vocabularyTheme}`)}`;

    const completion = await groq.chat.completions.create({
      model: MODEL_ID,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.6,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
    });

    promptTokens = completion.usage?.prompt_tokens ?? 0;
    completionTokens = completion.usage?.completion_tokens ?? 0;

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      statusCode = 502;
      return NextResponse.json(
        { error: 'Empty response from AI lesson generator' },
        { status: 502, headers: guard.headers },
      );
    }

    const lessonContent = JSON.parse(rawContent) as Record<string, unknown>;
    return NextResponse.json({ lesson: lessonContent }, { headers: guard.headers });
  } catch (err: unknown) {
    statusCode = 500;
    errorMessage = err instanceof Error ? err.message : 'Failed to generate lesson';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
    await logAiRequest(supabase, {
      endpoint: ENDPOINT,
      model: MODEL_ID,
      statusCode,
      latencyMs: Date.now() - startedAt,
      inputChars,
      promptTokens,
      completionTokens,
      errorMessage,
    });
  }
}
