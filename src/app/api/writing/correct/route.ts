import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import {
  buildWritingSystemPrompt,
  persistLearnerErrors,
  validateWritingFeedback,
  type WritingFeedback,
} from '@/lib/b1b2/feedback-schema';
import { buildEvalCacheKey, readEvalCache, writeEvalCache } from '@/lib/b1b2/eval-cache';

const MODEL_ID = 'openai/gpt-oss-20b';

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
    const variety = body.variety ?? 'British';

    if (!text) {
      return NextResponse.json({ error: 'Please provide text to evaluate.' }, { status: 400 });
    }

    if (text.length > 3000) {
      return NextResponse.json({ error: 'Text exceeds the 3,000-character limit.' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const cacheKey = buildEvalCacheKey({
      endpoint: '/api/writing/correct',
      model: MODEL_ID,
      prompt: `${prompt}|${targetKeywords.join(',')}`,
      input: text,
      variety,
    });

    let validated: WritingFeedback | null = null;
    let cacheHit = false;

    const cachedRaw = await readEvalCache<Record<string, unknown>>(supabase, cacheKey);
    if (cachedRaw) {
      try {
        validated = validateWritingFeedback(cachedRaw, text);
        cacheHit = true;
      } catch {
        validated = null;
      }
    }

    if (!validated) {
      const systemPrompt = buildWritingSystemPrompt(variety);
      const userPrompt = `Task Prompt: ${prompt}
Target Vocabulary: ${targetKeywords.length > 0 ? targetKeywords.join(', ') : 'None specified'}

Learner Response:
"""
${text}
"""`;

      const completion = await groq.chat.completions.create({
        model: MODEL_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1100,
        response_format: { type: 'json_object' },
      });

      const rawContent = completion.choices[0]?.message?.content;
      const parsed = rawContent ? (JSON.parse(rawContent) as unknown) : {};
      validated = validateWritingFeedback(parsed, text);

      await writeEvalCache(supabase, {
        cacheKey,
        endpoint: '/api/writing/correct',
        model: MODEL_ID,
        response: validated,
      });
    }

    const uiCorrections = validated.corrections.map((c) => ({
      original: c.original,
      corrected_sentence: c.corrected_sentence,
      alternative: c.corrected_sentence,
      error_category: c.error_category,
      explanation: c.explanation,
      reason: c.explanation,
      severity: c.severity,
      rule: c.rule,
    }));

    let submissionId: string | null = null;
    let newBadges: string[] = [];

    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        if (taskId) {
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
              task_response: validated.rubric.task_response,
              organisation: validated.rubric.organisation,
              grammar_accuracy: validated.rubric.grammar_accuracy,
              lexical_range: validated.rubric.lexical_range,
              style: validated.rubric.style,
              overall: validated.score,
              feedback: {
                summary: validated.feedback,
                corrected: validated.corrected,
                notes: validated.notes,
                errorPatterns: validated.errorPatterns,
                variety,
                rubric: validated.rubric,
              },
              corrections: uiCorrections,
              status: 'evaluated',
              ai_model: MODEL_ID,
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

        await persistLearnerErrors(supabase, {
          userId: user.id,
          sourceType: 'writing',
          sourceId: submissionId,
          lessonId: lessonId || null,
          corrections: validated.corrections,
        });
      }
    }

    return NextResponse.json({
      submissionId,
      corrected: validated.corrected,
      feedback: validated.feedback,
      notes: validated.notes,
      corrections: uiCorrections,
      errorPatterns: validated.errorPatterns,
      rubric: validated.rubric,
      score: validated.score,
      newBadges,
      cached: cacheHit,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to evaluate writing' },
      { status: 500 },
    );
  }
}
