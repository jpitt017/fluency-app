import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import {
  buildWritingSystemPrompt,
  persistLearnerErrors,
  validateWritingFeedback,
} from '@/lib/b1b2/feedback-schema';
import { buildEvalCacheKey, readEvalCache, writeEvalCache } from '@/lib/b1b2/eval-cache';
import { logAiRequest } from '@/lib/b1b2/observability';
import { sanitizeLearnerText, wrapLearnerSubmission } from '@/lib/b1b2/prompt-guard';

const ENDPOINT = '/api/checkpoints/writing';
const MODEL_ID = 'openai/gpt-oss-20b';
const MAX_CHECKPOINT_CHARS = 9000;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const supabase = await createServerSupabase();
  let statusCode = 200;
  let cacheHit = false;
  let inputChars = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let errorMessage: string | null = null;

  try {
    const guard = await enforceAiUsage(supabase, ENDPOINT, 3);
    if (!guard.allowed && guard.response) {
      statusCode = guard.response.status;
      return guard.response;
    }
    if (!supabase || !guard.userId) {
      statusCode = 401;
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const moduleNumber = Number(body?.moduleNumber);
    const objectiveId = sanitizeLearnerText(body?.objectiveId, 120).text;
    const { text: writing } = sanitizeLearnerText(body?.writing, MAX_CHECKPOINT_CHARS);
    inputChars = writing.length;
    const wordCount = writing ? writing.split(/\s+/).filter(Boolean).length : 0;

    if (!Number.isInteger(moduleNumber) || moduleNumber < 1 || moduleNumber > 8) {
      statusCode = 400;
      return NextResponse.json({ error: 'Select a valid module (1–8).' }, { status: 400, headers: guard.headers });
    }
    if (wordCount < 30 || wordCount > 1500) {
      statusCode = 400;
      return NextResponse.json(
        { error: 'Your response must be between 30 and 1,500 words.' },
        { status: 400, headers: guard.headers },
      );
    }

    const { data: mod } = await supabase
      .from('modules')
      .select('id, title, grammar_focus')
      .eq('module_number', moduleNumber)
      .maybeSingle();

    if (!mod) {
      statusCode = 404;
      return NextResponse.json({ error: 'Module not found.' }, { status: 404, headers: guard.headers });
    }

    const { data: writingTask } = await supabase
      .from('writing_tasks')
      .select('id, title, prompt')
      .eq('module_id', mod.id)
      .limit(1)
      .maybeSingle();

    if (!writingTask) {
      statusCode = 404;
      return NextResponse.json(
        { error: 'Writing task not found for this module.' },
        { status: 404, headers: guard.headers },
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      statusCode = 503;
      return NextResponse.json(
        { error: 'Writing assessor is not configured.' },
        { status: 503, headers: guard.headers },
      );
    }

    const grammarFocus = Array.isArray(mod.grammar_focus) ? mod.grammar_focus : [];
    const promptContext = `Module ${moduleNumber} (${mod.title}) · ${objectiveId || writingTask.title} | ${writingTask.prompt} | Target grammar: ${grammarFocus.join(', ')}`;

    const cacheKey = buildEvalCacheKey({
      endpoint: ENDPOINT,
      model: MODEL_ID,
      prompt: promptContext,
      input: writing,
      variety: 'British',
    });

    let validated = await readEvalCache<ReturnType<typeof validateWritingFeedback>>(supabase, cacheKey);
    if (validated) {
      try {
        validated = validateWritingFeedback(validated, writing);
        cacheHit = true;
      } catch {
        validated = null;
      }
    }

    if (!validated) {
      const groq = new Groq({ apiKey });
      const completion = await groq.chat.completions.create({
        model: MODEL_ID,
        messages: [
          { role: 'system', content: buildWritingSystemPrompt('British') },
          {
            role: 'user',
            content: `${promptContext}\n\n${wrapLearnerSubmission(writing)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1100,
        response_format: { type: 'json_object' },
      });

      promptTokens = completion.usage?.prompt_tokens ?? 0;
      completionTokens = completion.usage?.completion_tokens ?? 0;

      const raw = completion.choices[0]?.message?.content;
      const parsed = raw ? (JSON.parse(raw) as unknown) : {};
      validated = validateWritingFeedback(parsed, writing);

      await writeEvalCache(supabase, {
        cacheKey,
        endpoint: ENDPOINT,
        model: MODEL_ID,
        response: validated,
      });
    }

    const rubric = {
      taskAchievement: Math.round((validated.rubric.task_response / 5) * 100),
      grammarControl: Math.round((validated.rubric.grammar_accuracy / 5) * 100),
      lexicalRange: Math.round((validated.rubric.lexical_range / 5) * 100),
      coherence: Math.round((validated.rubric.organisation / 5) * 100),
    };
    const score = validated.score;
    const passed = Object.values(rubric).every((value) => Number(value) >= 60);

    const uiCorrections = validated.corrections.map((c) => ({
      original: c.original,
      corrected_sentence: c.corrected_sentence,
      suggestion: c.corrected_sentence,
      error_category: c.error_category,
      other_label: c.other_label,
      explanation: c.explanation,
      severity: c.severity,
    }));

    const fullFeedback = {
      ...rubric,
      corrections: uiCorrections,
      upgrade: validated.notes[0] ?? '',
      summary: validated.feedback,
      corrected: validated.corrected,
      objectiveId,
    };

    const { data: submission, error: insertError } = await supabase
      .from('writing_submissions')
      .insert({
        user_id: guard.userId,
        task_id: writingTask.id,
        body: writing,
        word_count: wordCount,
        task_response: validated.rubric.task_response,
        organisation: validated.rubric.organisation,
        grammar_accuracy: validated.rubric.grammar_accuracy,
        lexical_range: validated.rubric.lexical_range,
        style: validated.rubric.style,
        overall: score,
        feedback: fullFeedback,
        corrections: uiCorrections,
        status: 'evaluated',
        ai_model: MODEL_ID,
        evaluated_at: new Date().toISOString(),
      })
      .select('id, body, word_count, overall, feedback, created_at')
      .single();

    if (insertError) throw insertError;

    await persistLearnerErrors(supabase, {
      userId: guard.userId,
      sourceType: 'checkpoint_writing',
      sourceId: submission.id,
      sourceText: writing,
      sourceWordCount: wordCount,
      corrections: validated.corrections,
    });

    const { data: checkpoint } = await supabase
      .from('checkpoints')
      .select('id')
      .eq('module_id', mod.id)
      .maybeSingle();

    if (checkpoint) {
      await supabase.from('checkpoint_attempts').insert({
        user_id: guard.userId,
        checkpoint_id: checkpoint.id,
        status: 'evaluated',
        writing_submission_id: submission.id,
        scores: rubric,
        result: { passed, score, objectiveId },
        completed_at: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      {
        attempt: submission,
        passed,
        score,
        wordCount,
        rubric: fullFeedback,
        cached: cacheHit,
      },
      { headers: guard.headers },
    );
  } catch (error) {
    statusCode = 500;
    errorMessage = error instanceof Error ? error.message : 'Writing evaluation failed.';
    console.error('Writing checkpoint evaluation failed:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
    await logAiRequest(supabase, {
      endpoint: ENDPOINT,
      model: MODEL_ID,
      statusCode,
      latencyMs: Date.now() - startedAt,
      cacheHit,
      inputChars,
      promptTokens,
      completionTokens,
      errorMessage,
    });
  }
}
