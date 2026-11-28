import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import weeks01To04 from '@/supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import { createServerSupabase } from '@/utils/supabase/server';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { buildEvalCacheKey, readEvalCache, writeEvalCache } from '@/lib/b1b2/eval-cache';
import {
  buildWritingSystemPrompt,
  persistLearnerErrors,
  validateWritingFeedback,
  type WritingFeedback,
  type WritingWeekGoals,
} from '@/lib/b1b2/feedback-schema';
import { createGroqJsonCompletion } from '@/lib/b1b2/groq-json';
import { logAiRequest } from '@/lib/b1b2/observability';
import { providerFailureResponse } from '@/lib/b1b2/provider-failure-response';
import { loadLearnerWeek, type LearnerWeek } from '@/lib/curriculum/learner-week';
import { recordWeekSubmission } from '@/lib/curriculum/week-models';
import { sanitizeLearnerText, wrapLearnerSubmission } from '@/lib/b1b2/prompt-guard';

const ENDPOINT = '/api/writing/correct';
const MODEL_ID = 'openai/gpt-oss-20b';
const MAX_WRITING_CHARS = 3000;

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return new Groq({ apiKey });
}

function buildWeekWritingGoals(weekNumber: number | null, weekTask: LearnerWeek | null): WritingWeekGoals | undefined {
  if (!weekNumber || !weekTask) return undefined;
  const staticWeek = weeks01To04.weeks.find((w) => w.number === weekNumber);
  const inputParts: string[] = [];
  if (weekTask.writingInputEmail) {
    inputParts.push(
      `Email from ${weekTask.writingInputEmail.from}:\n"${weekTask.writingInputEmail.body}"\nYour four notes to cover: ${weekTask.writingInputEmail.notes.join(' | ')}`,
    );
  }
  if (weekTask.writingCallForArticles) {
    inputParts.push(
      `${weekTask.writingCallForArticles.heading}:\n${weekTask.writingCallForArticles.body}`,
    );
  }
  return {
    weekNumber,
    readerAndPurpose: staticWeek?.writing.readerAndPurpose,
    requiredPoints: weekTask.writingInputEmail
      ? weekTask.writingInputEmail.notes
      : staticWeek?.writing.requiredPoints,
    linkers: staticWeek?.writing.linkers,
    grammar: staticWeek?.writing.grammar,
    featuredWords: staticWeek?.writing.featuredWords,
    inputContext: inputParts.length > 0 ? inputParts.join('\n\n') : undefined,
  };
}

interface WritingCorrectBody {
  weekNumber?: number;
  text?: string;
  prompt?: string;
  targetKeywords?: string[];
  taskId?: string;
  lessonId?: string;
  revisedFrom?: string;
  variety?: 'British' | 'American' | 'International';
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const supabase = await createServerSupabase();
  let statusCode = 200;
  let cacheHit = false;
  let inputChars = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let errorMessage: string | null = null;
  let isSignedIn = false;

  try {
    const guard = await enforceAiUsage(supabase, ENDPOINT, 2);
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

    const body = (await req.json().catch(() => ({}))) as WritingCorrectBody;
    const rawLength = String(body.text ?? '').trim().length;
    if (rawLength > MAX_WRITING_CHARS) {
      statusCode = 400;
      return NextResponse.json(
        { error: `Text exceeds the ${MAX_WRITING_CHARS.toLocaleString()}-character limit.` },
        { status: 400, headers: guard.headers },
      );
    }

    const { text } = sanitizeLearnerText(body.text, MAX_WRITING_CHARS);
    inputChars = text.length;
    if (!text) {
      statusCode = 400;
      return NextResponse.json(
        { error: 'Please provide text to evaluate.' },
        { status: 400, headers: guard.headers },
      );
    }

    const prompt = sanitizeLearnerText(
      body.prompt || 'General B1 → B2 English writing task',
      500,
    ).text;
    const targetKeywords = Array.isArray(body.targetKeywords)
      ? body.targetKeywords.map((k) => sanitizeLearnerText(k, 60).text).filter(Boolean).slice(0, 12)
      : [];
    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
    const lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : '';
    const revisedFrom = typeof body.revisedFrom === 'string' ? body.revisedFrom.trim() : '';
    const variety = body.variety ?? 'British';

    const weekNumber = Number.isInteger(body.weekNumber) ? body.weekNumber! : null;
    const weekTask = weekNumber ? await loadLearnerWeek(weekNumber) : null;
    const weeklyTask = Boolean(
      weekTask && prompt.startsWith(sanitizeLearnerText(weekTask.writingPrompt, 500).text),
    );
    const weekGoals = weeklyTask ? buildWeekWritingGoals(weekNumber, weekTask) : undefined;
    const isPlacementSample = prompt.startsWith('Write 3–5 sentences (60–100 words)');

    const cacheKey = buildEvalCacheKey({
      endpoint: ENDPOINT,
      model: MODEL_ID,
      prompt: `writing-cambridge-v5|w:${weekNumber ?? ''}|${prompt}|${targetKeywords.join(',')}`,
      input: text,
      variety,
    });

    let validated: WritingFeedback | null = null;
    const cachedRaw = await readEvalCache<Record<string, unknown>>(supabase, cacheKey);
    if (cachedRaw) {
      try {
        validated = validateWritingFeedback(cachedRaw, text, {
          weekNumber,
          skipUnder100Cap: isPlacementSample,
        });
        cacheHit = true;
      } catch {
        validated = null;
      }
    }

    if (!validated) {
      const systemPrompt = buildWritingSystemPrompt(variety, weekGoals);
      const userPrompt = `Task Prompt: ${prompt}
Target Vocabulary: ${targetKeywords.length > 0 ? targetKeywords.join(', ') : 'None specified'}

${wrapLearnerSubmission(text)}`;

      const completion = await createGroqJsonCompletion(groq, {
        model: MODEL_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.25,
        maxCompletionTokens: 4096,
      });

      promptTokens = completion.promptTokens;
      completionTokens = completion.completionTokens;

      validated = validateWritingFeedback(completion.parsed, text, {
        weekNumber,
        skipUnder100Cap: isPlacementSample,
      });

      await writeEvalCache(supabase, {
        cacheKey,
        endpoint: ENDPOINT,
        model: MODEL_ID,
        response: validated,
      });
    }

    const uiCorrections = validated.corrections.map((c) => ({
      original: c.original,
      corrected_sentence: c.corrected_sentence,
      alternative: c.corrected_sentence,
      error_category: c.error_category,
      other_label: c.other_label,
      explanation: c.explanation,
      reason: c.explanation,
      severity: c.severity,
      rule: c.rule,
    }));

    const wordCount = validated.wordCount;
    let submissionId: string | null = null;
    let newBadges: string[] = [];

    if (supabase && guard.userId) {
      if (taskId) {
        const revisedFromUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          revisedFrom,
        )
          ? revisedFrom
          : null;
        const { data: inserted, error: insertError } = await supabase
          .from('writing_submissions')
          .insert({
            user_id: guard.userId,
            task_id: taskId,
            lesson_id: lessonId || null,
            revised_from: revisedFromUuid,
            body: text,
            word_count: wordCount,
            task_response: validated.areas.content.score,
            organisation: validated.areas.organisation.score,
            grammar_accuracy: validated.areas.language.score,
            lexical_range: validated.areas.language.score,
            style: validated.areas.communicative_achievement.score,
            overall: null,
            feedback: {
              summary: validated.feedback,
              corrected: validated.corrected,
              notes: validated.notes,
              errorPatterns: validated.errorPatterns,
              variety,
              areas: validated.areas,
              wordCount: validated.wordCount,
              contentCappedUnder100: validated.contentCappedUnder100,
              wordCountTip: validated.wordCountTip,
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
        userId: guard.userId,
        sourceType: 'writing',
        sourceId: submissionId,
        lessonId: lessonId || null,
        sourceText: text,
        sourceWordCount: wordCount,
        corrections: validated.corrections,
      });
    }

    const modelAnswer =
      weeklyTask && guard.userId
        ? await recordWeekSubmission(guard.userId, body.weekNumber, 'writing')
        : null;

    return NextResponse.json(
      {
        modelAnswer,
        weekRecorded: weekTask ? Boolean(modelAnswer) : null,
        submissionId,
        corrected: validated.corrected,
        feedback: validated.feedback,
        notes: validated.notes,
        corrections: uiCorrections,
        errorPatterns: validated.errorPatterns,
        areas: validated.areas,
        wordCount: validated.wordCount,
        contentCappedUnder100: validated.contentCappedUnder100,
        wordCountTip: validated.wordCountTip,
        newBadges,
        cached: cacheHit,
      },
      { headers: guard.headers },
    );
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
      cacheHit,
      inputChars,
      promptTokens,
      completionTokens,
      errorMessage,
    }, isSignedIn);
  }
}
