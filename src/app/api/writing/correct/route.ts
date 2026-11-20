import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return new Groq({ apiKey });
}

interface WritingCorrectBody {
  text?: string;
  prompt?: string;
  targetKeywords?: string[];
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
    const body = (await req.json().catch(() => ({}))) as WritingCorrectBody;
    const text = (body.text || '').trim();
    const prompt = body.prompt || 'General B1 → B2 English writing task';
    const targetKeywords = Array.isArray(body.targetKeywords) ? body.targetKeywords : [];

    if (!text) {
      return NextResponse.json({ error: 'Please provide text to evaluate.' }, { status: 400 });
    }

    if (text.length > 3000) {
      return NextResponse.json({ error: 'Text exceeds the 3,000-character limit.' }, { status: 400 });
    }

    const systemPrompt = `You are a CEFR B1 → B2 English writing examiner.
Evaluate the learner's writing for task response, organisation, grammar accuracy, vocabulary range, and style.
Return strictly valid JSON with no markdown fences using this exact schema:
{
  "corrected": "string (natural, polished B2-ready rewrite preserving the learner's intended meaning)",
  "feedback": "string (encouraging 2-3 sentence summary of strengths and key areas to improve)",
  "notes": ["string (specific grammar, collocation, linker, or style correction with one alternative phrasing)"],
  "score": 80
}`;

    const userPrompt = `Task Prompt: ${prompt}
Target Vocabulary: ${targetKeywords.length > 0 ? targetKeywords.join(', ') : 'None specified'}

Learner Response:
"""
${text}
"""`;

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 900,
      response_format: { type: 'json_object' },
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      return NextResponse.json({
        corrected: text,
        feedback: 'We received your submission, but detailed analysis was unavailable. Please try again.',
        notes: [],
        score: 70,
      });
    }

    try {
      const parsed = JSON.parse(rawContent) as Record<string, unknown>;
      return NextResponse.json({
        corrected: typeof parsed.corrected === 'string' ? parsed.corrected : text,
        feedback:
          typeof parsed.feedback === 'string'
            ? parsed.feedback
            : 'Good effort! Review the suggested B2 phrasing above.',
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        score: typeof parsed.score === 'number' ? parsed.score : 75,
      });
    } catch {
      return NextResponse.json({
        corrected: text,
        feedback: rawContent,
        notes: [],
        score: 75,
      });
    }
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to evaluate writing' },
      { status: 500 },
    );
  }
}
