'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, RotateCcw, Sparkles } from 'lucide-react';
import { computeWordDiff, type DiffToken } from '@/lib/b1b2/diff';
import { previewFsrsIntervals, type ReviewGrade } from '@/lib/b1b2/fsrs';
import { canUpgradeToEasy, gradeForTypedAnswer, type planQueue } from '@/lib/b1b2/review-queue.mjs';
import type { ReviewQueueCard } from '@/lib/b1b2/types';

const SELF_GRADES: { grade: ReviewGrade; label: string }[] = [
  { grade: 'again', label: 'Again' },
  { grade: 'hard', label: 'Hard' },
  { grade: 'good', label: 'Good' },
  { grade: 'easy', label: 'Easy' },
];

type Plan = ReturnType<typeof planQueue>;

interface CheckRewriteResponse {
  fixed: boolean;
  sameAsOriginal?: boolean;
  blockedByRecentReveal?: boolean;
  mastered: boolean;
  xpAwarded: number;
  reason?: string;
  diffFromOriginal: DiffToken[];
  diffToTarget: DiffToken[];
  correctedSentence: string;
  explanation: string;
  error?: string;
}

/**
 * The Review page.
 *
 * Grading follows the marking, not the learner's opinion, wherever there is
 * something to mark:
 *
 * - a wrong typed answer is Again, and there is no way to upgrade it;
 * - a right typed answer is Good, and Easy is offered as a deliberate choice;
 * - a card with no typed answer keeps all four buttons.
 *
 * The daily allowance is decided on the server and passed in, so a reload does
 * not hand out a fresh twenty. "Review more" lifts the cap for this sitting.
 */
export default function ErrorReviewStudio({
  initialCards,
  plan,
}: {
  initialCards: ReviewQueueCard[];
  plan: Plan;
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckRewriteResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reviewMore, setReviewMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const finished = index >= cards.length;

  /**
   * Lift the daily cap for this sitting.
   *
   * The cap is a server decision, so this re-requests the queue with the
   * allowance waived rather than trusting a browser flag.
   */
  async function loadMore() {
    setLoadingMore(true);
    setError('');
    try {
      const response = await fetch('/api/review/more', { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as { cards?: ReviewQueueCard[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not load more cards.');
      const extra = data.cards ?? [];
      if (extra.length === 0) {
        setReviewMore(true);
        router.refresh();
        return;
      }
      setCards(extra);
      setIndex(0);
      setReviewMore(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load more cards.');
    } finally {
      setLoadingMore(false);
    }
  }

  // Done for today: either the cap is reached, or the queue is empty.
  if (finished) {
    const cappedOut = plan.capReached || plan.remaining > 0;
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-center">
        <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-700" />
        <h3 className="mt-2 font-serif text-lg font-bold text-emerald-950">
          Well done! That&rsquo;s today&rsquo;s review.
        </h3>
        <p className="mt-1 text-sm text-emerald-800">
          {reviewed > 0
            ? `You reviewed ${reviewed} card${reviewed === 1 ? '' : 's'}${masteredCount ? ` and mastered ${masteredCount}` : ''}. The rest will come back another day.`
            : cappedOut
              ? 'You have already done your cards today. Anything still due will be waiting tomorrow.'
              : 'Nothing is due right now. Your mistakes come back here just before you forget them.'}
        </p>
        {plan.canReviewMore && !reviewMore && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            className="mt-4 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : 'Review more'}
          </button>
        )}
        {error && <p className="mt-2 text-xs font-medium text-rose-700">{error}</p>}
      </section>
    );
  }

  const card = cards[index];
  const hints = previewFsrsIntervals(card);
  // A reveal has no mark to report; a real attempt does. `fixed` is the field the
  // route actually sends, so it is what decides whether marking sets the rating.
  const typedResult = Boolean(checkResult && 'fixed' in checkResult);

  async function revealWithoutTrying() {
    setError('');
    setChecking(true);
    try {
      await fetch('/api/review/check-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, revealOnly: true }),
      });
    } catch {
      /* Ignore network failure on reveal tracking */
    } finally {
      setCheckResult(null);
      setRevealed(true);
      setChecking(false);
    }
  }

  async function checkAndReveal() {
    setError('');
    if (!attempt.trim()) {
      await revealWithoutTrying();
      return;
    }

    setChecking(true);
    try {
      const res = await fetch('/api/review/check-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, rewrite: attempt.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as CheckRewriteResponse;
      if (!res.ok) throw new Error(data.error ?? 'Could not verify rewrite.');

      if (data.sameAsOriginal) {
        setError(data.reason || 'That matches the original sentence — change the flawed part first.');
        return;
      }

      setCheckResult(data);
      if (data.mastered) setMasteredCount((n) => n + 1);
      setRevealed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify rewrite.');
      setRevealed(true);
    } finally {
      setChecking(false);
    }
  }

  function advanceNext() {
    setReviewed((n) => n + 1);
    setIndex((i) => i + 1);
    setAttempt('');
    setRevealed(false);
    setCheckResult(null);
    setError('');
  }

  async function gradeCard(grade: ReviewGrade) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/srs/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, cardType: card.type, grade }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not save review.');
      advanceNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save review.');
    } finally {
      setBusy(false);
    }
  }

  /** The typed answer decides the grade; the learner only chooses Easy or not. */
  async function gradeFromMarking(easy: boolean) {
    const correct = typedResult ? Boolean(checkResult?.fixed) : false;
    const grade: ReviewGrade = correct ? (easy ? 'easy' : gradeForTypedAnswer(true)) : gradeForTypedAnswer(false);
    await gradeCard(grade);
  }

  const isVocab = card.type === 'vocab';
  const fallbackDiff =
    card.type === 'error' ? computeWordDiff(card.prompt_sentence, card.corrected_sentence) : [];

  return (
    <section className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-indigo-800">
            <RotateCcw className="h-3 w-3" />
            <span>{isVocab ? 'Word review' : `Practise your mistakes · ${card.category.replace(/_/g, ' ')}`}</span>
          </span>
          {card.type === 'error' && card.card_format && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-stone-600">
              {card.card_format === 'cloze' ? 'Context repair' : 'Sentence fix'}
            </span>
          )}
          <span className="text-xs text-stone-500">
            Card {index + 1} / {cards.length}
          </span>
        </div>
        <span className="text-xs text-stone-500">{plan.summary}</span>
      </div>

      <div className="mt-4 space-y-3 rounded-xl border border-stone-200 bg-stone-50/70 p-4">
        {isVocab ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-800">Do you remember this word?</p>
            <p className="text-base font-medium text-stone-900">{card.term}</p>
            {!revealed && (
              <p className="text-xs text-stone-600">
                Say or write what it means, then check yourself.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-800">
              Fix this sentence without hints:
            </p>
            <p className="text-base font-medium text-stone-900">&ldquo;{card.prompt_sentence}&rdquo;</p>
            {card.context_sentence && card.context_sentence !== card.prompt_sentence && (
              <p className="text-xs text-stone-600">
                Context: <span className="italic">{card.context_sentence}</span>
              </p>
            )}
          </>
        )}

        {!revealed ? (
          card.hasTypedAnswer ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <input
                type="text"
                value={attempt}
                aria-label="Your corrected sentence"
                onChange={(e) => setAttempt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void checkAndReveal();
                  }
                }}
                placeholder="Type your corrected version…"
                className="flex-1 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm text-stone-900 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={checking}
                onClick={() => void checkAndReveal()}
                className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
              >
                {checking ? 'Checking…' : attempt.trim() ? 'Check my repair' : 'Reveal answer'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
            >
              Show the meaning
            </button>
          )
        ) : (
          <div className="space-y-3 pt-1">
            {isVocab && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Meaning</p>
                <p className="mt-0.5 font-semibold text-emerald-950">{card.definition}</p>
                <p className="mt-1 text-xs italic text-stone-700">{card.example}</p>
                {card.translation_es && (
                  <p lang="es" className="mt-1 text-xs text-stone-600">
                    {card.translation_es}
                  </p>
                )}
              </div>
            )}

            {card.type === 'error' && checkResult?.fixed && checkResult.mastered && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
                  <span>
                    Valid unprompted repair verified! Card mastered (+{checkResult.xpAwarded} XP).
                    {checkResult.reason ? ` ${checkResult.reason}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={advanceNext}
                  className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Next card →
                </button>
              </div>
            )}

            {card.type === 'error' && !(checkResult?.fixed && checkResult.mastered) && (
              <>
                {checkResult?.blockedByRecentReveal && (
                  <p className="text-xs font-semibold text-amber-800">
                    You used a hint, so this one is not mastered yet.
                  </p>
                )}
                {attempt.trim() && (
                  <p className="text-xs font-semibold text-amber-800">
                    Your repair: &ldquo;{attempt.trim()}&rdquo;
                    {checkResult?.reason ? ` — ${checkResult.reason}` : ' — compare your answer below.'}
                  </p>
                )}
                <div className="rounded-lg border border-stone-200 bg-white p-3 text-xs">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                    Word-level diff (original → {checkResult ? 'your repair' : 'reference'})
                  </p>
                  <div className="flex flex-wrap gap-1 leading-6">
                    {(checkResult ? checkResult.diffFromOriginal : fallbackDiff).map((tok, i) => (
                      <span
                        key={i}
                        className={
                          tok.type === 'removed'
                            ? 'rounded bg-rose-100 px-1 text-rose-800 line-through'
                            : tok.type === 'added'
                              ? 'rounded bg-emerald-100 px-1 font-semibold text-emerald-900'
                              : 'text-stone-800'
                        }
                      >
                        {tok.text}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Reference correction</p>
                  <p className="mt-0.5 font-semibold text-emerald-950">{card.corrected_sentence}</p>
                  <p className="mt-1 text-xs text-stone-700">{card.explanation}</p>
                </div>
              </>
            )}

            {/*
              The grading buttons.
              - typed and marked: Again (wrong) or Good/Easy (right). No Hard,
                and no way up from a wrong answer.
              - not typed, or answered only by recall: the four self-ratings.
            */}
            {card.type === 'error' && typedResult ? (
              <div>
                {checkResult?.fixed ? (
                  <>
                    <p className="mb-2 text-sm font-semibold text-emerald-900">
                      That is right. This card moves on as <strong>Good</strong>.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void gradeFromMarking(false)}
                        className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                      >
                        Good · {hints.good}
                      </button>
                      {canUpgradeToEasy({ correct: true }) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void gradeFromMarking(true)}
                          className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          Easy · {hints.easy}
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-2 text-sm font-semibold text-amber-900">
                      Not this time. This card comes back as <strong>Again</strong>.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void gradeFromMarking(false)}
                      className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                    >
                      Again · {hints.again}
                    </button>
                  </>
                )}
              </div>
            ) : (
              !(card.type === 'error' && checkResult?.fixed && checkResult.mastered) && (
                <div>
                  <p className="mb-2 text-sm font-semibold">How well did you remember it?</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {SELF_GRADES.map((g) => (
                      <button
                        key={g.grade}
                        type="button"
                        disabled={busy}
                        onClick={() => void gradeCard(g.grade)}
                        className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-800 transition hover:border-indigo-500 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        {g.label}
                        <span className="mt-0.5 block text-[10px] font-normal text-stone-500">{hints[g.grade]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-xs font-medium text-rose-700">{error}</p>}
    </section>
  );
}
