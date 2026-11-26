import { NextResponse } from 'next/server';
import details from '@/supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import vocabularyBank from '@/supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json';
import { createServerSupabase } from '@/utils/supabase/server';
import { readStoredCurrentWeek } from '@/lib/curriculum/stored-current-week';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { logAiRequest } from '@/lib/b1b2/observability';
import { providerFailureResponse } from '@/lib/b1b2/provider-failure-response';
import { sentenceFeedback, SENTENCE_MODEL_ID, type SentenceContext } from '@/lib/b1b2/week-sentence-feedback';
import { normaliseFeedback, praiseFor, reviewCardFor } from '@/lib/curriculum/free-text-marking.mjs';
import { matchesGrammarAnswer } from '@/lib/curriculum/grammar-marking.mjs';
import { copiesExample, grammarSentenceCount, hasUnfilledStarter } from '@/lib/curriculum/week-sentence-copy.mjs';
import { sentenceExamples, sentenceSupport } from '@/lib/curriculum/week-sentence-support';
import { grammarUseItFeedback } from '@/lib/b1b2/grammar-use-it-feedback';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * One route for the three free-text boxes on /week/[n]:
 *
 *   grammar "Fix it" rewrite items   step: 'Rewrite'
 *   grammar "Use it" sentences       step: 'Use it'
 *   vocabulary step 7 sentences      id "V<n>-S<n>" in the vocabulary bank
 *
 * The target comes from the private item bank and a miss can create a Review
 * card. Fix it keeps its existing deterministic check and attempt table.
 * Personal items reject copied examples and atomically save up to two checked
 * versions alongside their attempts. Delete my data clears every version.
 *
 * Marking criteria never reach the browser; teaching examples are separate.
 */

const MODEL_ID = SENTENCE_MODEL_ID;
const LOG_ENDPOINT = '/api/week/sentence';
const MAX_ANSWER = 600;

type Body = { week?: unknown; id?: unknown; answer?: unknown; version?: unknown };

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
        // Use it has a distinct authored target for each item (including the
        // week's secondary form); a week-wide label is not specific enough.
        target: grammarItem.step === 'Use it' && key ? key : grammarWeek?.grammar.main ?? 'the grammar from this week',
        kind: grammarItem.step === 'Rewrite' ? 'grammar-rewrite' : 'grammar-use-it',
      },
      category: 'tense',
      accepted: concrete,
    };
  }

  const vocabularyWeek = vocabularyBank.weeks.find((entry) => entry.week === week);
  const sentence = vocabularyWeek?.yourSentence.find((entry) => entry.id === id);
  if (sentence) {
    const support = sentenceSupport(week, id);
    return {
      // Keep the authored onTargetWhen exactly as it was: it is the criterion
      // passed to the model, not the new prompt, starter, or teaching examples.
      context: {
        prompt: support?.kind === 'vocabulary-sentence' ? support.prompt : sentence.prompt,
        target: sentence.onTargetWhen,
        kind: 'vocabulary-sentence',
      },
      category: 'word_choice',
      accepted: [],
    };
  }

  return null;
}

/** Which week attempt table stores this answer; the optional checks also use it for progress. */
function attemptTable(kind: SentenceContext['kind']): 'week_grammar_attempts' | 'week_vocabulary_attempts' {
  return kind === 'vocabulary-sentence' ? 'week_vocabulary_attempts' : 'week_grammar_attempts';
}

type Claim = { status?: string; claimToken?: string; version?: number; previous?: { answer?: string } | null };

/** Personal items have a durable, server-enforced two-check limit per item. */
async function checkPersonalSentence({
  client, admin, userId, week, id, answer, item, version, startedAt,
}: {
  client: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
  week: number;
  id: string;
  answer: string;
  item: Resolved;
  version: unknown;
  startedAt: number;
}) {
  const examples = sentenceExamples(week, id);
  if (!examples.length) return NextResponse.json({ error: 'This sentence is not available.' }, { status: 503 });
  // This is feedback, not a failed mark: do not charge, save a Review card, or
  // use up either of the learner's checks for a copied teaching example.
  if (copiesExample(answer, examples)) {
    return NextResponse.json({ copiedExample: true, message: 'Try to write about your own life.' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (hasUnfilledStarter(answer)) {
    return NextResponse.json({ error: 'Fill in the blanks with your own ideas first.' }, { status: 400 });
  }
  if (item.context.kind === 'grammar-use-it' && ![2, 3].includes(grammarSentenceCount(answer))) {
    return NextResponse.json({ error: 'Write 2–3 sentences about your own life.' }, { status: 400 });
  }
  if (item.context.kind === 'vocabulary-sentence' && answer.length > 500) {
    return NextResponse.json({ error: 'Please keep your sentence under 500 characters.' }, { status: 400 });
  }
  // A stale first-check request is never silently treated as a rewrite. Older
  // clients that omit the field can only request the first check.
  const requestedVersion = version === undefined ? 1 : version;
  if (requestedVersion !== 1 && requestedVersion !== 2) {
    return NextResponse.json({ error: 'Please reload this page and try again.' }, { status: 400 });
  }
  const { data, error: claimError } = await admin.rpc('claim_week_sentence_check', {
    p_user_id: userId, p_week_number: week, p_item_id: id, p_kind: item.context.kind,
    p_answer: answer, p_version: requestedVersion,
  });
  const claim = data as Claim | null;
  if (claimError || !claim) return NextResponse.json({ error: 'Could not save your answer. Please try again.' }, { status: 503 });
  if (claim.status === 'limit') return NextResponse.json({ error: 'You have checked this item twice.' }, { status: 409 });
  if (claim.status === 'busy') return NextResponse.json({ error: 'A check is already in progress. Please wait.' }, { status: 409 });
  if (claim.status === 'stale') return NextResponse.json({ error: 'Your saved work has changed. Please reload this page.' }, { status: 409 });
  if (claim.status !== 'claimed' || typeof claim.claimToken !== 'string' || claim.version !== requestedVersion) {
    return NextResponse.json({ error: 'Could not save your answer. Please try again.' }, { status: 503 });
  }
  const token = claim.claimToken;
  let completed = false;
  let headers: Record<string, string> = {};
  try {
    if (requestedVersion === 2 && typeof claim.previous?.answer !== 'string') {
      return NextResponse.json({ error: 'Could not load your first answer. Please try again.' }, { status: 503 });
    }
    if (!process.env.GROQ_API_KEY) {
      await logAiRequest(client, {
        endpoint: LOG_ENDPOINT, model: MODEL_ID, statusCode: 503, latencyMs: Date.now() - startedAt,
        inputChars: answer.length, errorMessage: 'AI checker is not configured',
      }, true);
      return NextResponse.json({ error: 'We could not check your sentence. Please try again.' }, { status: 503 });
    }
    const guard = await enforceAiUsage(client, '/api/review/check-rewrite', 1);
    headers = guard.headers;
    if (!guard.allowed && guard.response) return guard.response;

    let result;
    try {
      result = item.context.kind === 'grammar-use-it'
        ? await grammarUseItFeedback(item.context, answer, claim.previous?.answer)
        : await sentenceFeedback(item.context, answer);
    } catch (err) {
      const failure = await providerFailureResponse({
        admin: client, endpoint: LOG_ENDPOINT, model: MODEL_ID, error: err, workSaved: true,
      });
      await logAiRequest(client, {
        endpoint: LOG_ENDPOINT, model: MODEL_ID, statusCode: failure.status, latencyMs: Date.now() - startedAt,
        inputChars: answer.length, errorMessage: failure.errorMessage,
      }, true);
      return failure.response;
    }
    if (!result) {
      await logAiRequest(client, {
        endpoint: LOG_ENDPOINT, model: MODEL_ID, statusCode: 503, latencyMs: Date.now() - startedAt,
        inputChars: answer.length, errorMessage: 'AI checker returned no verdict',
      }, true);
      return NextResponse.json({ error: 'We could not check your sentence. Please try again.' }, { status: 503, headers });
    }
    await logAiRequest(client, {
      endpoint: LOG_ENDPOINT, model: MODEL_ID, statusCode: 200, latencyMs: Date.now() - startedAt,
      inputChars: answer.length, promptTokens: result.promptTokens, completionTokens: result.completionTokens,
    }, true);

    const { data: saved, error: saveError } = await admin.rpc('finish_week_sentence_check', {
      p_user_id: userId, p_week_number: week, p_item_id: id, p_claim_token: token,
      p_on_target: result.onTarget, p_feedback: result.feedback,
    });
    if (saveError || !saved || saved.status !== 'completed') {
      return NextResponse.json({ error: 'Could not save your answer. Please try again.' }, { status: 503, headers });
    }
    completed = true;

    let addedToReview = false;
    if (!result.onTarget) {
      const card = reviewCardFor({
        kind: 'use-it', prompt: answer, answer, corrected: result.feedback.corrected,
        target: item.context.target, category: item.category,
      });
      if (card) {
        const { error: cardError } = await admin.from('error_review_cards').insert({ user_id: userId, ...card });
        addedToReview = !cardError;
        if (cardError && cardError.code !== '23505') console.error('[week-sentence] Failed to add review card:', cardError.message);
      }
    }
    return NextResponse.json({
      onTarget: result.onTarget,
      corrected: result.feedback.corrected,
      addedToReview,
      checkedWith: 'model',
      version: saved.version,
      first: saved.first,
      second: saved.second,
    }, { headers: { ...headers, 'Cache-Control': 'no-store', 'X-Check-Latency-Ms': String(Date.now() - startedAt) } });
  } finally {
    if (!completed) {
      try {
        const { error } = await admin.rpc('release_week_sentence_check', {
          p_user_id: userId, p_week_number: week, p_item_id: id, p_claim_token: token,
        });
        if (error) console.error('[week-sentence] Could not release check:', error.message);
      } catch (error) {
        console.error('[week-sentence] Could not release check:', error);
      }
    }
  }
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
  const currentWeek = await readStoredCurrentWeek(client, user.id);
  if (currentWeek === null) return NextResponse.json({ error: 'Could not check your progress.' }, { status: 503 });
  if (week > currentWeek) {
    return NextResponse.json({ error: 'This week is not open yet.' }, { status: 403 });
  }

  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Could not save your answer.' }, { status: 503 });

  if (item.context.kind !== 'grammar-rewrite') {
    return checkPersonalSentence({ client, admin, userId: user.id, week, id: body.id, answer, item, version: body.version, startedAt });
  }

  // Deterministic first: an answer that matches one of the authored correct
  // answers is accepted without a model call, so it costs no AI units. Anything
  // else is judged by the model, which is what lets a differently-worded but
  // correct sentence through -- the point of not marking against one key.
  let onTarget = item.accepted.some((candidate) => matchesGrammarAnswer(candidate, answer, true));

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
      await logAiRequest(client, {
        endpoint: LOG_ENDPOINT,
        model: MODEL_ID,
        statusCode: 503,
        latencyMs: Date.now() - startedAt,
        inputChars: answer.length,
        errorMessage: 'AI checker is not configured',
      }, true);
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
        await logAiRequest(client, {
          endpoint: LOG_ENDPOINT,
          model: MODEL_ID,
          statusCode: 503,
          latencyMs: Date.now() - startedAt,
          inputChars: answer.length,
          errorMessage: 'AI checker returned no verdict',
        }, true);
        return NextResponse.json({ error: 'We could not check your sentence. Please try again.' }, { status: 503, headers });
      }
      usedLlm = true;
      promptTokens = result.promptTokens;
      completionTokens = result.completionTokens;
      onTarget = result.onTarget;
      feedback = result.feedback;
      await logAiRequest(client, {
        endpoint: LOG_ENDPOINT,
        model: MODEL_ID,
        statusCode: 200,
        latencyMs: Date.now() - startedAt,
        inputChars: answer.length,
        promptTokens,
        completionTokens,
      }, true);
    } catch (err) {
      // The attempt is stored below either way, so the work is saved; the B1
      // wording for that lives in provider-errors, never the provider's words.
      const failure = await providerFailureResponse({
        admin: client,
        endpoint: LOG_ENDPOINT,
        model: MODEL_ID,
        error: err,
        workSaved: false,
      });
      await logAiRequest(client, {
        endpoint: LOG_ENDPOINT,
        model: MODEL_ID,
        statusCode: failure.status,
        latencyMs: Date.now() - startedAt,
        inputChars: answer.length,
        errorMessage: failure.errorMessage,
      }, true);
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
