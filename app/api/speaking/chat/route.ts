import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    if (!rawBody || rawBody.trim() === '') {
      return NextResponse.json(
        { error: 'Empty request body received.' },
        { status: 400 }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('JSON Parse Error. Raw body received was:', rawBody);
      return NextResponse.json(
        { error: `Invalid JSON payload received. Starts with: "${rawBody.substring(0, 20)}..."` },
        { status: 400 }
      );
    }

    const { messages, context } = parsed;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid or missing messages array in JSON payload.' },
        { status: 400 }
      );
    }

    const sessionTitle = context?.sessionTitle || 'B1 British English Small Talk';
    const keyLanguage = context?.keyLanguage || [];

    const systemPrompt = `You are a friendly, natural British colleague and B1 English speaking coach in a London office.
Session Context:
- Theme: ${sessionTitle}
- Target Grammar/Lexis: ${keyLanguage.join(', ') || 'Natural British idioms and small talk'}

Guidelines:
1. Keep your replies conversational, warm, and distinctly British (use natural UK phrasing like "brilliant", "sorted", "right then").
2. Ask a natural follow-up question to keep the dialogue going.
3. Keep responses concise (2-4 sentences max) so the learner can practise back-and-forth speaking.`;

    const chatCompletion = await groq.chat.completions.create({
      model: process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b',
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });

    const reply =
      chatCompletion.choices[0]?.message?.content ||
      "Right then, let's keep going with our chat!";

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error('Error in /api/speaking/chat:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to process chat turn.' },
      { status: 500 }
    );
  }
}