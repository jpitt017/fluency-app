import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import Groq from 'groq-sdk';
import {
  buildWritingSystemPrompt,
  persistLearnerErrors,
  validateWritingFeedback,
} from '@/lib/b1b2/feedback-schema';
import { buildEvalCacheKey, readEvalCache, writeEvalCache } from '@/lib/b1b2/eval-cache';

const MODEL_ID = 'openai/gpt-oss-20b';

async function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase is not configured.');
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* Read-only request context */
        }
      },
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const moduleNumber = Number(body?.moduleNumber);
    const objectiveId = typeof body?.objectiveId === 'string' ? body.objectiveId : '';
    const writing = typeof body?.writing === 'string' ? body.writing.trim() : '';
    const wordCount = writing ? writing.split(/\s+/).length : 0;

    if (!Number.isInteger(moduleNumber) || moduleNumber < 1 || moduleNumber > 8) {
      return NextResponse.json({ error: 'Select a valid module (1–8).' }, { status: 400 });
    }
    if (wordCount < 30 || wordCount > 1500) {
      return NextResponse.json({ error: 'Your response must be between 30 and 1,500 words.' }, { status: 400 });
    }

    const { data: mod } = await supabase
      .from('modules')
      .select('id, title, grammar_focus')
      .eq('module_number', moduleNumber)
      .maybeSingle();

    if (!mod) return NextResponse.json({ error: 'Module not found.' }, { status: 404 });

    const { data: writingTask } = await supabase
      .from('writing_tasks')
      .select('id, title, prompt')
      .eq('module_id', mod.id)
      .limit(1)
      .maybeSingle();

    if (!writingTask) return NextResponse.json({ error: 'Writing task not found for this module.' }, { status: 404 });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Writing assessor is not configured.' }, { status: 503 });

    const grammarFocus = Array.isArray(mod.grammar_focus) ? mod.grammar_focus : [];
    const promptContext = `Module ${moduleNumber} (${mod.title}) · ${objectiveId || writingTask.title} | ${writingTask.prompt} | Target grammar: ${grammarFocus.join(', ')}`;

    const cacheKey = buildEvalCacheKey({
      endpoint: '/api/checkpoints/writing',
      model: MODEL_ID,
      prompt: promptContext,
      input: writing,
      variety: 'British',
    });

    let validated = await readEvalCache<ReturnType<typeof validateWritingFeedback>>(supabase, cacheKey);
    let cacheHit = false;
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
            content: `${promptContext}\n\nLearner writing:\n"""\n${writing}\n"""`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1100,
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices[0]?.message?.content;
      const parsed = raw ? (JSON.parse(raw) as unknown) : {};
      validated = validateWritingFeedback(parsed, writing);

      await writeEvalCache(supabase, {
        cacheKey,
        endpoint: '/api/checkpoints/writing',
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
        user_id: user.id,
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
      userId: user.id,
      sourceType: 'checkpoint_writing',
      sourceId: submission.id,
      corrections: validated.corrections,
    });

    const { data: checkpoint } = await supabase
      .from('checkpoints')
      .select('id')
      .eq('module_id', mod.id)
      .maybeSingle();

    if (checkpoint) {
      await supabase.from('checkpoint_attempts').insert({
        user_id: user.id,
        checkpoint_id: checkpoint.id,
        status: 'evaluated',
        writing_submission_id: submission.id,
        scores: rubric,
        result: { passed, score, objectiveId },
        completed_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      attempt: submission,
      passed,
      score,
      wordCount,
      rubric: fullFeedback,
      cached: cacheHit,
    });
  } catch (error) {
    console.error('Writing checkpoint evaluation failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Writing evaluation failed.' },
      { status: 500 },
    );
  }
}
