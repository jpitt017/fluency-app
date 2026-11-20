import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { z } from 'zod';
import { createServerSupabase } from '@/utils/supabase/server';
import { computeWordDiff, normalizeSentenceForCompare } from '@/lib/b1b2/diff';
import { logAiRequest } from '@/lib/b1b2/observability';
import {
  sanitizeLearnerText,
  UNTRUSTED_DATA_SYSTEM_RULE,
  wrapLearnerSubmission,
} from '@/lib/b1b2/prompt-guard';

const MODEL_ID = 'openai/gpt-oss-20b';

const CheckRewriteSchema = z.union([
  z.object({
    cardId: z.string().uuid(),
    revealOnly: z.literal(true),
  }),
  z.object({
    cardId: z.string().uuid(),
    revealOnly: z.literal(false).optional(),
    rewrite: z.string().trim().min(1).max(600),
  }),
]);

async function checkSemanticEquivalence(params: {
  original: string;
  reference: string;
  category: string;
  rewrite: string;
}): Promise<{
  fixed: boolean;
  reason: string;
  promptTokens: number;
  completionTokens: number;
} | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: MODEL_ID,
    messages: [
      {
        role: 'system',
        content: `You are a concise CEFR B1 → B2 English grammar checker.
${UNTRUSTED_DATA_SYSTEM_RULE}
Evaluate whether the learner's rewrite fixes the target mistake without introducing a new grammatical or lexical error. Accept any valid, natural English phrasing — do not insist on an exact word-for-word match with the reference if another natural phrasing is accurate.
Return strict JSON: { "fixed": boolean, "reason": "one short B1 British English sentence" }`,
      },
      {
        role: 'user',
        content: `Target error category: ${params.category}
Original flawed sentence: ${params.original}
Reference correction: ${params.reference}
Learner rewrite:
${wrapLearnerSubmission(params.rewrite)}`,
      },
    ],
    temperature: 0,
    max_tokens: 180,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content;
  const parsed = raw ? (JSON.parse(raw) as { fixed?: unknown; reason?: unknown }) : {};
  return {
    fixed: Boolean(parsed.fixed),
    reason: typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : '',
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
  };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const supabase = await createServerSupabase();
  let usedLlm = false;
  let statusCode = 200;
  let promptTokens = 0;
  let completionTokens = 0;
  let inputChars = 0;
  let errorMessage: string | null = null;

  try {
    if (!supabase) {
      statusCode = 503;
      return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      statusCode = 401;
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = CheckRewriteSchema.safeParse(body);
    if (!parsed.success) {
      statusCode = 400;
      return NextResponse.json({ error: 'Provide a valid cardId and rewrite sentence.' }, { status: 400 });
    }

    const { data: card, error: cardErr } = await supabase
      .from('error_review_cards')
      .select('id, prompt_sentence, corrected_sentence, explanation, category, mastered, hint_revealed_at')
      .eq('id', parsed.data.cardId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (cardErr || !card) {
      statusCode = 404;
      return NextResponse.json({ error: 'Error review card not found.' }, { status: 404 });
    }

    if (parsed.data.revealOnly) {
      await supabase.rpc('reveal_error_card_hint', { p_card_id: card.id });
      return NextResponse.json({
        cardId: card.id,
        revealed: true,
        correctedSentence: card.corrected_sentence,
        explanation: card.explanation,
      });
    }

    const { text: cleanRewrite } = sanitizeLearnerText(parsed.data.rewrite, 600);
    inputChars = cleanRewrite.length;
    const normRewrite = normalizeSentenceForCompare(cleanRewrite);
    const normOriginal = normalizeSentenceForCompare(card.prompt_sentence);
    const normTarget = normalizeSentenceForCompare(card.corrected_sentence);

    const diffFromOriginal = computeWordDiff(card.prompt_sentence, cleanRewrite);
    const diffToTarget = computeWordDiff(cleanRewrite, card.corrected_sentence);

    // Anti-no-op guard: submitting the original flawed sentence cannot pass or master
    if (!normRewrite || normRewrite === normOriginal) {
      return NextResponse.json({
        cardId: card.id,
        fixed: false,
        sameAsOriginal: true,
        mastered: Boolean(card.mastered),
        xpAwarded: 0,
        reason: 'That still matches the original flawed sentence — try repairing the error first.',
        diffFromOriginal,
        diffToTarget,
        correctedSentence: card.corrected_sentence,
        explanation: card.explanation,
      });
    }

    // Step 1: Cheap deterministic match
    let fixed = normRewrite === normTarget;
    let reason = fixed ? 'Exact match with the target correction.' : '';

    // Step 2: Tolerant semantic check for alternative valid repairs
    if (!fixed) {
      try {
        const semantic = await checkSemanticEquivalence({
          original: card.prompt_sentence,
          reference: card.corrected_sentence,
          category: card.category,
          rewrite: cleanRewrite,
        });
        if (semantic) {
          usedLlm = true;
          promptTokens = semantic.promptTokens;
          completionTokens = semantic.completionTokens;
          fixed = semantic.fixed;
          reason = semantic.reason;
        }
      } catch {
        /* Fall back to deterministic result if semantic check fails */
      }
    }

    let mastered = Boolean(card.mastered);
    let xpAwarded = 0;
    let blockedByRecentReveal = false;

    if (fixed && !mastered) {
      const { data: masteryRes } = await supabase.rpc('mark_error_card_mastered', {
        p_card_id: card.id,
        p_attempt_text: cleanRewrite,
      });
      const resObj = masteryRes as { mastered?: boolean; xp?: number; reason?: string } | null;
      mastered = Boolean(resObj?.mastered);
      xpAwarded = Number(resObj?.xp ?? 0);
      if (!mastered && resObj?.reason === 'revealed_recently') {
        blockedByRecentReveal = true;
      }
    } else {
      await supabase
        .from('error_review_cards')
        .update({ last_attempt_text: cleanRewrite })
        .eq('id', card.id)
        .eq('user_id', user.id);
    }

    return NextResponse.json({
      cardId: card.id,
      fixed,
      mastered,
      blockedByRecentReveal,
      xpAwarded,
      reason,
      diffFromOriginal,
      diffToTarget,
      correctedSentence: card.corrected_sentence,
      explanation: card.explanation,
    });
  } catch (err: unknown) {
    statusCode = 500;
    errorMessage = err instanceof Error ? err.message : 'Failed to check rewrite';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
    if (usedLlm) {
      await logAiRequest(supabase, {
        endpoint: '/api/review/check-rewrite',
        model: MODEL_ID,
        statusCode,
        latencyMs: Date.now() - startedAt,
        inputChars,
        promptTokens,
        completionTokens,
        errorMessage,
      });
    }
  }
}
