import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { text, context } = await req.json();

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'No text was provided for correction.' },
        { status: 400 }
      );
    }

    const lessonContextInstruction = context
      ? `
The student is currently practising the lesson "${context.sessionTitle || 'B1 British English'}".
- Target Grammar & Lexis: ${context.grammarFocus || 'General B1 British English'}
- Key Language Targets: ${(context.keyLanguage || []).join('; ')}

In your feedback notes:
1. Explicitly evaluate how well they used the target grammar and vocabulary above.
2. Provide clear, constructive B1 British English corrections (UK spelling and natural British phrasing).
`
      : 'Provide general B1 British English writing corrections.';

    const systemPrompt = `You are an expert B1 British English writing coach.
${lessonContextInstruction}

Return ONLY valid JSON matching this exact schema:
{
  "corrected": "<corrected B1 British English version>",
  "notes": ["<feedback note 1>", "<feedback note 2>"]
}`;

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Student text to correct: "${text}"` },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = {
        corrected: text,
        notes: ['Check your sentence structure and ensure natural British phrasing.'],
      };
    }

    return NextResponse.json({
      corrected: parsed.corrected || text,
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    });
  } catch (err: any) {
    console.error('Error in /api/writing/correct:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to process writing correction.' },
      { status: 500 }
    );
  }
}