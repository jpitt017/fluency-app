import { NextResponse } from 'next/server';
import details from '@/supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import vocabularyBank from '@/supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { logAiRequest } from '@/lib/b1b2/observability';
import { providerFailureResponse } from '@/lib/b1b2/provider-failure-response';
import { sentenceFeedback, SENTENCE_MODEL_ID, type SentenceContext } from '@/lib/b1b2/week-sentence-feedback';
import { normaliseFeedback, normaliseSentence, praiseFor, reviewCardFor } from '@/lib/curriculum/free-text-marking.mjs';
import { matchesGrammarAnswer } from '@/lib/curriculum/grammar-marking.mjs';

/**
 * One route for the three free-text boxes on /week/[n]:
 *
 *   grammar "Fix it" rewrite items   step: 'Rewrite'
 *   grammar "Use it" sentences       step: 'Use it'
 *   vocabulary step 7 sentences      id "V<n>-S<n>" in the vocabulary bank
 *
 * They share everything that matters: the target form is resolved on the server
 * from the private item bank, the answer is checked against it before any model
 * call, the attempt is stored in the week attempt tables so "Delete my data"
 * already covers it, and a miss becomes a Review card.
 *
 * Nothing from the item bank reaches the browser except the feedback for the
 * sentence the learner just wrote.
 */

const MODEL_ID = SENTENCE_MODEL_ID;
const MAX_ANSWER = 600;

type Body = { week?: unknown; id?: unknown; answer?: unknown };

type Resolved = {
  context: SentenceContext;
  /** Authoring category, used when a Review card is created. */
  category: string;
  /**
   * Concrete correct answers, straight from the item bank. Empty when the item
   * has no single answer ("Use it", vocabulary sentences), because there the
   * only way to judge the sentence is to read it.
   */
  accepted: string[];
};

function resolveItem(week: number, id: string): Resolved | null {
  const grammarWeek = details.weeks.find((entry) => entry.number === week);
  const grammarItem = grammarWeek?.grammar.practice.items.find((entry) => entry.id === id) as
    | { id: string; step: string; prompt: string; target?: string }
    | undefined;

  if (grammarItem && (grammarItem.step === 'Rewrite' || grammarItem.step === 'Use it')) {
    const full = grammarItem as unknown as { key?: unknown; accepted?: unknown };
    const key = typeof full.key === 'string' ? full.key : '';
    const acceptedList = Array.isArray(full.accepted)
      ? full.accepted.filter((value): value is string => typeof value === 'string')
      : [];

    // A prose key ("Any correct sentence with used to or would") is an
    // instruction to the teacher, not an answer, so it is not used for matching.
    const isProseKey = /^(any|correct|a correct|two |one )/i.test(key.trim());
    const concrete = grammarItem.step === 'Rewrite' && !isProseKey ? [key, ...acceptedList].filter(Boolean) : [];

    return {
      context: {
        prompt: grammarItem.prompt,
        // The week's grammar is what the model is told the sentence must use.
        target: grammarWeek?.grammar.main ?? 'the grammar from this week',
        kind: grammarItem.step === 'Rewrite' ? 'grammar-rewrite' : 'grammar-use-it',
      },
      category: 'tense',
      accepted: concrete,
    };
  }

  const vocabularyWeek = vocabularyBank.weeks.find((entry) => entry.week === week);
  const sentence = vocabularyWeek?.yourSentence.find((entry) => entry.id === id);
  if (sentence) {
    return {
      // onTargetWhen is a prose note for the teacher, so it is passed to the
      // model as context only. The model answers (there is one) is the best
      // single answer available, and is used for the deterministic check.
      context: { prompt: sentence.prompt, target: sentence.onTargetWhen, kind: 'vocabulary-sentence' },
      category: 'word_choice',
      accepted: sentence.model ? [sentence.model] : [],
    };
  }

  return null;
}

/** Which week attempt table stores this answer; reuse, no new table. */
function attemptTable(kind: SentenceContext['kind']): 'week_grammar_attempts' | 'week_vocabulary_attempts' {
  return kind === 'vocabulary-sentence' ? 'week_vocabulary_attempts' : 'week_grammar_attempts';
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) {
    return NextResponse.json({ error: 'Sign in to check your sentence.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const answer = typeof body?.answer === 'string' ? body.answer.trim() : '';
  if (
    !body ||
    !Number.isInteger(body.week) ||
    typeof body.id !== 'string' ||
    !answer ||
    answer.length > MAX_ANSWER
  ) {
    return NextResponse.json({ error: 'Write a sentence first, then press Check.' }, { status: 400 });
  }
  const week = Number(body.week);
  const item = resolveItem(week, body.id);
  if (!item) return NextResponse.json({ error: 'This sentence is not available.' }, { status: 404 });

  // A week that is not open yet cannot be practised, same rule as the fixed items.
  const progress = await client.rpc('refresh_current_week');
  if (progress.error) return NextResponse.json({ error: 'Could not check your progress.' }, { status: 503 });
  if (week > Number(progress.data)) {
    return NextResponse.json({ error: 'This week is not open yet.' }, { status: 403 });
  }

  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Could not save your answer.' }, { status: 503 });

  // Deterministic first: an answer that matches one of the authored correct
  // answers is accepted without a model call, so it costs no AI units. Anything
  // else is judged by the model, which is what lets a differently-worded but
  // correct sentence through -- the point of not marking against one key.
  let onTarget = item.context.kind === 'grammar-rewrite'
    ? item.accepted.some((candidate) => matchesGrammarAnswer(candidate, answer, true))
    : item.accepted.map(normaliseSentence).includes(normaliseSentence(answer));

  let feedback = normaliseFeedback(null, {
    good: praiseFor(item.context.target, true) ?? 'You wrote a clear sentence.',
    corrected: answer,
    tip: 'Check the word order once more before you send it.',
  });

  let usedLlm = false;
  let promptTokens = 0;
  let completionTokens = 0;
  let headers: Record<string, string> = {};

  if (!onTarget) {
    // Do not charge a learner or invent a wrong mark if there is no checker.
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'We could not check your sentence. Please try again.' }, { status: 503 });
    }
    const guard = await enforceAiUsage(client, '/api/review/check-rewrite', 1);
    headers = guard.headers;
    if (!guard.allowed && guard.response) return guard.response;

    try {
      const result = await sentenceFeedback(item.context, answer);
      if (!result) {
        // No verdict is not a mistake. Leave the text in the learner's box and
        // do not save a false mark or make a Review card for an unknown result.
        return NextResponse.json({ error: 'We could not check your sentence. Please try again.' }, { status: 503, headers });
      }
      usedLlm = true;
      promptTokens = result.promptTokens;
      completionTokens = result.completionTokens;
      onTarget = result.onTarget;
      feedback = result.feedback;
    } catch (err) {
      // The attempt is stored below either way, so the work is saved; the B1
      // wording for that lives in provider-errors, never the provider's words.
      const failure = await providerFailureResponse({
        admin: client,
        endpoint: '/api/review/check-rewrite',
        model: MODEL_ID,
        error: err,
        workSaved: false,
      });
      return failure.response;
    }
  }

  const table = attemptTable(item.context.kind);
  const { error: attemptError } = await admin.from(table).insert({
    user_id: user.id,
    week_number: week,
    item_id: body.id,
    answer,
    correct: onTarget,
  });
  if (attemptError) {
    console.error('[week-sentence] Failed to save attempt:', attemptError.message);
    return NextResponse.json({ error: 'Could not save your answer. Please try again.' }, { status: 503 });
  }

  // A sentence that missed the target becomes a Review card. The card is a
  // repair for a rewrite item and a cloze for the learner's own sentence, which
  // is what reviewCardFor decides.
  let addedToReview = false;
  if (!onTarget) {
    const card = reviewCardFor({
      kind: item.context.kind === 'grammar-rewrite' ? 'rewrite' : 'use-it',
      prompt: item.context.kind === 'grammar-rewrite' ? item.context.prompt : answer,
      answer,
      corrected: feedback.corrected || answer,
      target: item.context.target,
      category: item.category,
    });
    if (card) {
      const { error: cardError } = await admin.from('error_review_cards').insert({
        user_id: user.id,
        ...card,
      });
      // A duplicate (same category and normalised prompt) is not an error worth
      // telling the learner about; the card already exists.
      addedToReview = !cardError;
      if (cardError && cardError.code !== '23505') {
        console.error('[week-sentence] Failed to add review card:', cardError.message);
      }
    }
  }

  if (usedLlm) {
    await logAiRequest(client, {
      endpoint: '/api/review/check-rewrite',
      model: MODEL_ID,
      statusCode: 200,
      latencyMs: Date.now() - startedAt,
      inputChars: answer.length,
      promptTokens,
      completionTokens,
      errorMessage: null,
    });
  }

  return NextResponse.json(
    {
      onTarget,
      good: feedback.good,
      corrected: feedback.corrected,
      tip: feedback.tip,
      addedToReview,
      checkedWith: usedLlm ? 'model' : 'target-form',
    },
    {
      headers: {
        ...headers,
        'Cache-Control': 'no-store',
        'X-Check-Latency-Ms': String(Date.now() - startedAt),
      },
    },
  );
}
