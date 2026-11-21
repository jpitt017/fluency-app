import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { createGroqJsonCompletion } from '@/lib/b1b2/groq-json';
import { UNTRUSTED_DATA_SYSTEM_RULE, sanitizeLearnerText, wrapLearnerSubmission } from '@/lib/b1b2/prompt-guard';

const ENDPOINT = '/api/writing/correct'; // reuse the writing AI quota bucket
const MODEL_ID = 'openai/gpt-oss-20b';
const MAX_CHARS = 3000;

const SYSTEM_PROMPT = `You are a supportive CEFR B1 → B2 mediation assessor.
Give concise feedback on exactly four criteria: Task fulfilment, Clarity for the reader, Language accuracy, Organisation.
Then answer one extra question in a single line: "Did the reader get what they need?"
Do not mark mediation as required for unlocking; it is recommended practice only.
Write every note in clear, simple British English.

${UNTRUSTED_DATA_SYSTEM_RULE}

Return strictly valid JSON with no markdown fences:
{
  "criteria": [
    { "label": "Task fulfilment", "note": "string" },
    { "label": "Clarity for the reader", "note": "string" },
    { "label": "Language accuracy", "note": "string" },
    { "label": "Organisation", "note": "string" }
  ],
  "readerNeed": "Yes — ... | Partly — ... | No — ...",
  "feedback": "string (2 encouraging sentences)",
  "suggestion": "string (one concrete improvement)"
}`;

interface FeedbackBody {
  text?: string;
  prompt?: string;
  output?: string;
  source?: string;
  scale?: string;
  level?: string;
  week?: number;
}

function asNote(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  let statusCode = 200;

  try {
    const guard = await enforceAiUsage(supabase, ENDPOINT, 2);
    if (!guard.allowed && guard.response) {
      statusCode = guard.response.status;
      return guard.response;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      statusCode = 503;
      return NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 503, headers: guard.headers });
    }

    const body = (await req.json().catch(() => ({}))) as FeedbackBody;
    const { text: submission } = sanitizeLearnerText(body.text, MAX_CHARS);
    if (!submission) {
      statusCode = 400;
      return NextResponse.json({ error: 'Please provide a mediation response.' }, { status: 400, headers: guard.headers });
    }

    const clean = (value: unknown, max: number) => sanitizeLearnerText(value, max).text;
    const userPrompt = [
      `Week: ${clean(body.week ?? 1, 3)}`,
      `Mediation prompt: ${clean(body.prompt ?? 'Mediation task', 500)}`,
      `Source: ${clean(body.source ?? 'Not specified', 200)}`,
      `Required output: ${clean(body.output ?? 'Short message', 200)}`,
      `CEFR scale: ${clean(body.scale ?? 'Mediation', 200)}`,
      `Level: ${clean(body.level ?? 'B1', 20)}`,
      '',
      wrapLearnerSubmission(submission),
    ].join('\n');

    const completion = await createGroqJsonCompletion(new Groq({ apiKey }), {
      model: MODEL_ID,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.25,
      maxCompletionTokens: 1536,
    });

    const rawCriteria = Array.isArray(completion.parsed.criteria) ? completion.parsed.criteria : [];
    const fallbackLabels = ['Task fulfilment', 'Clarity for the reader', 'Language accuracy', 'Organisation'];
    const criteria = fallbackLabels.map((label, index) => {
      const item = rawCriteria[index] as Record<string, unknown> | undefined;
      return {
        label: asNote(item?.label) || label,
        note: asNote(item?.note) || 'No specific note was returned for this criterion.',
      };
    });

    return NextResponse.json(
      {
        criteria,
        readerNeed: asNote(completion.parsed.readerNeed) || 'Partly — check whether your reader has all the key information.',
        feedback: asNote(completion.parsed.feedback) || 'Good attempt at relaying the information clearly.',
        suggestion: asNote(completion.parsed.suggestion) || 'Add one concrete detail from the source next time.',
      },
      { headers: guard.headers },
    );
  } catch (error) {
    statusCode = 500;
    console.error(`${ENDPOINT} failed`, error);
    return NextResponse.json(
      { error: 'Mediation feedback is temporarily unavailable. Please try again.' },
      { status: statusCode },
    );
  }
}
