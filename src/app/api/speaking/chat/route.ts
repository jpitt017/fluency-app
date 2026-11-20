import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

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
  let groq: Groq;

  try {
    groq = getGroqClient();
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Groq API is not configured on the server' },
      { status: 500 },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as SpeakingChatBody;
    const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const scenario =
      body.scenario ||
      body.context?.sessionTitle ||
      'A natural workplace or everyday B1 → B2 conversation';
    const targetPhrase =
      body.targetPhrase ||
      (Array.isArray(body.context?.keyLanguage) ? body.context.keyLanguage.join(', ') : '');

    if (messages.length === 0) {
      return NextResponse.json({ error: 'At least one message is required.' }, { status: 400 });
    }

    const systemPrompt = `You are a supportive English conversation coach helping a CEFR B1 → B2 learner practise fluent spoken English.
Scenario: ${scenario}
${targetPhrase ? `Target language to encourage naturally: "${targetPhrase}"` : ''}

Guidelines:
- Keep responses concise (2–4 sentences) so the dialogue feels natural and spoken.
- Use clear, idiomatic international English with B1 → B2 collocations and discourse linkers.
- Gently model accurate grammar in your reply without breaking the role-play flow, and end with an open question to keep the learner speaking.`;

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role,
          content: String(m.content || '').slice(0, 1000),
        })),
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ||
      'That makes a lot of sense. Could you explain a bit more about your view on that?';

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate conversation reply' },
      { status: 500 },
    );
  }
}
