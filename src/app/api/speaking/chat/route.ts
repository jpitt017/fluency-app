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
}

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
    const body = (await req.json().catch(() => ({}))) as SpeakingChatBody;
    const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const scenario = body.scenario || 'A friendly conversation in a London café';
    const targetPhrase = body.targetPhrase || '';

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'At least one message is required.' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a friendly British English conversation partner helping a CEFR B1 learner practise spoken UK English.
Scenario: ${scenario}
${targetPhrase ? `Target phrase to encourage naturally: "${targetPhrase}"` : ''}

Guidelines:
- Keep responses concise (2-4 sentences) so the conversation feels natural and spoken.
- Use natural British English expressions and spelling (e.g., lovely, fancy a cuppa, brilliant, fortnight, queue).
- Gently model correct grammar in your reply without interrupting the roleplay flow, and end with an open question to keep the learner speaking.`;

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
      "That's lovely! Could you tell me a bit more about that?";

    return NextResponse.json({ reply });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to generate conversation reply' },
      { status: 500 }
    );
  }
}