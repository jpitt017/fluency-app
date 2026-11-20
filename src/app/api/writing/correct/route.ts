import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';

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
  taskId?: string;
  lessonId?: string;
  revisedFrom?: string;
  variety?: 'British' | 'American' | 'International';
}

function clampFive(val: unknown, fallback = 3.6): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Number(Math.max(0, Math.min(5, num)).toFixed(1));
}

export async function POST(req: NextRequest) {
  let groq: Groq;

  try {
    groq = getGroqClient();
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Groq API is not configured on the server' },
      { status: 503 },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as WritingCorrectBody;
    const text = (body.text || '').trim();
    const prompt = body.prompt || 'General B1 → B2 English writing task';
    const targetKeywords = Array.isArray(body.targetKeywords) ? body.targetKeywords : [];
    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
    const lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : '';
    const revisedFrom = typeof body.revisedFrom === 'string' ? body.revisedFrom.trim() : '';
    const variety = body.variety ?? 'International';

    if (!text) {
      return NextResponse.json({ error: 'Please provide text to evaluate.' }, { status: 400 });
    }

    if (text.length > 3000) {
      return NextResponse.json({ error: 'Text exceeds the 3,000-character limit.' }, { status: 400 });
    }

    const systemPrompt = `You are a CEFR B1 → B2 English writing examiner.
Evaluate the learner's writing on the 5-criterion B1 → B2 writing rubric (each 0 to 5, allowing .5 increments).
Preferred English variety for spelling/register notes: ${variety} English.
Return strictly valid JSON with no markdown fences using this exact schema:
{
  "corrected": "string (natural, polished B2-ready rewrite preserving the learner's intended meaning)",
  "feedback": "string (encouraging 2-3 sentence summary of strengths and key areas to improve)",
  "notes": ["string (specific grammar, collocation, linker, or style correction with one alternative phrasing)"],
  "corrections": [{"original": "string", "alternative": "string", "reason": "string (plain-English explanation of what was wrong and why)", "rule": "string (short pattern name e.g. 'Present perfect vs past simple' or 'Make vs do collocation')"}],
  "errorPatterns": ["articles" | "prepositions" | "tense_aspect" | "collocations" | "connectors" | "word_order"],
  "rubric": {
    "task_response": 4.0,
    "organisation": 3.8,
    "grammar_accuracy": 3.5,
    "lexical_range": 3.7,
    "style": 3.8
  },
  "score": 78
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
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const rawContent = completion.choices[0]?.message?.content;
    const parsed = rawContent ? (JSON.parse(rawContent) as Record<string, unknown>) : {};
    const rawRubric = (parsed.rubric && typeof parsed.rubric === 'object'
      ? parsed.rubric
      : {}) as Record<string, unknown>;

    const rubric = {
      task_response: clampFive(rawRubric.task_response, 3.8),
      organisation: clampFive(rawRubric.organisation, 3.7),
      grammar_accuracy: clampFive(rawRubric.grammar_accuracy, 3.5),
      lexical_range: clampFive(rawRubric.lexical_range, 3.6),
      style: clampFive(rawRubric.style, 3.7),
    };

    const avgFive =
      (rubric.task_response +
        rubric.organisation +
        rubric.grammar_accuracy +
        rubric.lexical_range +
        rubric.style) /
      5;
    const score =
      typeof parsed.score === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed.score)))
        : Math.round((avgFive / 5) * 100);

    const corrected = typeof parsed.corrected === 'string' ? parsed.corrected : text;
    const feedback =
      typeof parsed.feedback === 'string'
        ? parsed.feedback
        : 'Good effort! Review the suggested B2 phrasing above.';
    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter((n): n is string => typeof n === 'string').slice(0, 8)
      : [];
    const corrections = Array.isArray(parsed.corrections) ? parsed.corrections.slice(0, 10) : [];
    const errorPatterns = Array.isArray(parsed.errorPatterns)
      ? parsed.errorPatterns.filter((t): t is string => typeof t === 'string').slice(0, 5)
      : [];

    let submissionId: string | null = null;
    let newBadges: string[] = [];

    if (taskId) {
      const supabase = await createServerSupabase();
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const wordCount = text.split(/\s+/).filter(Boolean).length;
          const { data: inserted, error: insertError } = await supabase
            .from('writing_submissions')
            .insert({
              user_id: user.id,
              task_id: taskId,
              lesson_id: lessonId || null,
              revised_from: revisedFrom || null,
              body: text,
              word_count: wordCount,
              task_response: rubric.task_response,
              organisation: rubric.organisation,
              grammar_accuracy: rubric.grammar_accuracy,
              lexical_range: rubric.lexical_range,
              style: rubric.style,
              overall: score,
              feedback: {
                summary: feedback,
                corrected,
                notes,
                errorPatterns,
                variety,
                rubric,
              },
              corrections,
              status: 'evaluated',
              ai_model: 'openai/gpt-oss-20b',
              evaluated_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (!insertError && inserted) {
            submissionId = inserted.id;
            const { data: badgeCodes } = await supabase.rpc('evaluate_badges');
            if (Array.isArray(badgeCodes)) {
              newBadges = badgeCodes.filter((c): c is string => typeof c === 'string');
            }
          }
        }
      }
    }

    return NextResponse.json({
      submissionId,
      corrected,
      feedback,
      notes,
      corrections,
      errorPatterns,
      rubric,
      score,
      newBadges,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to evaluate writing' },
      { status: 500 },
    );
  }
}
