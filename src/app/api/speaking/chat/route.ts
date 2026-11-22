import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { currentLearnerWeek } from '@/lib/curriculum/current-week';
import { languageRules, safeChatReply } from '@/lib/b1b2/chat-language.mjs';
import { logAiRequest } from '@/lib/b1b2/observability';
import {
  sanitizeLearnerText,
  UNTRUSTED_DATA_SYSTEM_RULE,
  wrapLearnerSubmission,
} from '@/lib/b1b2/prompt-guard';

const ENDPOINT = '/api/speaking/chat';
const MODEL_ID = 'openai/gpt-oss-20b';

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return new Groq({ apiKey });
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SpeakingChatBody {
  messages?: ChatMessage[];
  scenario?: string;
  targetPhrase?: string;
  context?: {
    sessionTitle?: string;
    keyLanguage?: string[];
  };
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
    const guard = await enforceAiUsage(supabase, ENDPOINT, 1);
    if (!guard.allowed && guard.response) {
      statusCode = guard.response.status;
      return guard.response;
    }

    let groq: Groq;
    try {
      groq = getGroqClient();
    } catch (err: unknown) {
      statusCode = 503;
      errorMessage = err instanceof Error ? err.message : 'Groq API is not configured on the server';
      return NextResponse.json({ error: errorMessage }, { status: 503, headers: guard.headers });
    }

    const body = (await req.json().catch(() => ({}))) as SpeakingChatBody;
    const rawMessages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const scenario = sanitizeLearnerText(
      body.scenario || body.context?.sessionTitle || 'A natural workplace or everyday B1 → B2 conversation',
      300,
    ).text;
    const targetPhrase = sanitizeLearnerText(
      body.targetPhrase ||
        (Array.isArray(body.context?.keyLanguage) ? body.context.keyLanguage.join(', ') : ''),
      300,
    ).text;

    if (rawMessages.length === 0) {
      statusCode = 400;
      return NextResponse.json(
        { error: 'At least one message is required.' },
        { status: 400, headers: guard.headers },
      );
    }

    const sanitizedMessages = rawMessages.map((m) => {
      const clean = sanitizeLearnerText(m.content, 1000).text;
      inputChars += clean.length;
      return {
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.role === 'assistant' ? clean : wrapLearnerSubmission(clean),
      };
    });

    const week = await currentLearnerWeek();
    const systemPrompt = `You are a supportive English conversation coach helping a CEFR B1 → B2 learner practise fluent spoken English.
Learner week: ${week}
${languageRules(week)}
Scenario: ${scenario}
${targetPhrase ? `Target language to encourage naturally: "${targetPhrase}"` : ''}

${UNTRUSTED_DATA_SYSTEM_RULE}

Guidelines:
- Keep responses concise (2–4 sentences) so the dialogue feels natural and spoken.
- Match the learner’s week and language level. Do not force target phrases above that level.
- Gently model accurate grammar in your reply without breaking the role-play flow, and end with an open question to keep the learner speaking.`;

    const completion = await groq.chat.completions.create({
      model: MODEL_ID,
      messages: [{ role: 'system', content: systemPrompt }, ...sanitizedMessages],
      temperature: 0.7,
      max_completion_tokens: 1024,
      reasoning_effort: 'low',
      include_reasoning: false,
    });

    promptTokens = completion.usage?.prompt_tokens ?? 0;
    completionTokens = completion.usage?.completion_tokens ?? 0;

    const reply = safeChatReply(completion.choices[0]?.message?.content, week);

    return NextResponse.json({ reply }, { headers: guard.headers });
  } catch (err: unknown) {
    statusCode = 500;
    errorMessage = err instanceof Error ? err.message : 'Failed to generate conversation reply';
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
