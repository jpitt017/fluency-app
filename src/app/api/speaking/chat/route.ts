import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { currentLearnerWeek } from '@/lib/curriculum/current-week';
import { languageRules, safeChatReply } from '@/lib/b1b2/chat-language.mjs';
import { logAiRequest } from '@/lib/b1b2/observability';
import { providerFailureResponse } from '@/lib/b1b2/provider-failure-response';
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
  weekNumber?: number;
  discussAndDecide?: {
    topic?: string;
    prompt?: string;
    options?: string[];
    decisionTask?: string;
  };
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
  let isSignedIn = false;

  try {
    const guard = await enforceAiUsage(supabase, ENDPOINT, 1);
    isSignedIn = Boolean(guard.userId);
    if (!guard.allowed && guard.response) {
      statusCode = guard.response.status;
      return guard.response;
    }

    let groq: Groq;
    try {
      groq = getGroqClient();
    } catch {
      statusCode = 503;
      const failure = await providerFailureResponse({
        admin: supabase,
        endpoint: ENDPOINT,
        model: MODEL_ID,
        error: Object.assign(new Error('GROQ_API_KEY is not configured'), { status: 401 }),
        workSaved: false,
        headers: guard.headers,
      });
      errorMessage = failure.errorMessage;
      return failure.response;
    }

    const body = (await req.json().catch(() => ({}))) as SpeakingChatBody;
    const rawMessages = Array.isArray(body.messages) ? body.messages.slice(-14) : [];
    const discuss = body.discussAndDecide;
    const discussOptions = Array.isArray(discuss?.options)
      ? discuss.options
          .map((item) => sanitizeLearnerText(item, 80).text)
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const discussDecision = discuss?.decisionTask
      ? sanitizeLearnerText(discuss.decisionTask, 180).text
      : '';
    const scenario = sanitizeLearnerText(
      discuss?.topic ||
        discuss?.prompt ||
        body.scenario ||
        body.context?.sessionTitle ||
        'A natural workplace or everyday B1 → B2 conversation',
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

    const requestedWeek =
      typeof body.weekNumber === 'number' &&
      Number.isInteger(body.weekNumber) &&
      body.weekNumber >= 1 &&
      body.weekNumber <= 32
        ? body.weekNumber
        : null;
    const week = requestedWeek ?? (await currentLearnerWeek());

    const discussBlock =
      discussOptions.length > 0
        ? `\nDiscuss-and-decide task:
- Situation: ${scenario}
- Five options to discuss: ${discussOptions.join(' · ')}
- Decision goal: ${discussDecision || 'Agree together on the best choice.'}
- Act as an equal B1 speaking partner (not an examiner). React directly to the option(s) the learner mentions, weigh another option from the five, and after 2–3 exchanges invite them to agree together on the final choice(s).`
        : '';

    const systemPrompt = `You are a supportive British English speaking partner helping a CEFR B1 → B2 learner practise natural spoken interaction.
Learner week: ${week}
${languageRules(week)}
Scenario: ${scenario}
${targetPhrase ? `Target language to encourage naturally: "${targetPhrase}"` : ''}${discussBlock}

${UNTRUSTED_DATA_SYSTEM_RULE}

Guidelines:
- Keep responses concise (2–3 short sentences, <= 20 words per sentence, B1–B2 words only) so the dialogue feels natural and spoken.
- Match the learner's week and language level. Do not force target phrases above that level.
- Gently model accurate grammar in your reply without breaking the conversation flow, and end with an open question or invitation so the learner keeps speaking.`;

    const completion = await groq.chat.completions.create({
      model: MODEL_ID,
      messages: [{ role: 'system', content: systemPrompt }, ...sanitizedMessages],
      temperature: 0.65,
      max_completion_tokens: 1024,
      reasoning_effort: 'low',
      include_reasoning: false,
    });

    promptTokens = completion.usage?.prompt_tokens ?? 0;
    completionTokens = completion.usage?.completion_tokens ?? 0;

    const reply = safeChatReply(completion.choices[0]?.message?.content, week);

    return NextResponse.json({ reply }, { headers: guard.headers });
  } catch (err: unknown) {
    const failure = await providerFailureResponse({
      admin: supabase,
      endpoint: ENDPOINT,
      model: MODEL_ID,
      error: err,
      workSaved: false,
    });
    statusCode = failure.status;
    errorMessage = failure.errorMessage;
    return failure.response;
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
    }, isSignedIn);
  }
}
