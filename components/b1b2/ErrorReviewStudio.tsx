'use client';

import { useState } from 'react';
import { CheckCircle2, RotateCcw, Sparkles } from 'lucide-react';
import { computeWordDiff, type DiffToken } from '@/lib/b1b2/diff';
import { previewFsrsIntervals, type ReviewGrade } from '@/lib/b1b2/fsrs';
import type { ErrorReviewCardRow } from '@/lib/b1b2/types';

const GRADES: { grade: ReviewGrade; label: string }[] = [
  { grade: 'again', label: 'Again' },
  { grade: 'hard', label: 'Hard' },
  { grade: 'good', label: 'Good' },
  { grade: 'easy', label: 'Easy' },
];

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

export default function ErrorReviewStudio({ initialCards }: { initialCards: ErrorReviewCardRow[] }) {
  const [cards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckRewriteResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-stone-800">No error review cards due right now.</p>
        <p className="mt-1 text-xs text-stone-500">
          Your speaking and writing mistakes appear here. You get up to five new cards daily.
        </p>
      </div>
    );
  }

  if (index >= cards.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-center">
        <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-700" />
        <h3 className="mt-2 font-serif text-lg font-bold text-emerald-950">
          Error repair session complete ({reviewed} reviewed · {masteredCount} mastered)
        </h3>
        <p className="mt-1 text-xs text-emerald-800">
          Finished cards leave your list. Other cards will return later.
        </p>
      </div>
    );
  }

  const card = cards[index];
  const hints = previewFsrsIntervals(card);
  const fallbackDiff = computeWordDiff(card.prompt_sentence, card.corrected_sentence);

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
        body: JSON.stringify({
          cardId: card.id,
          rewrite: attempt.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as CheckRewriteResponse;
      if (!res.ok) throw new Error(data.error ?? 'Could not verify rewrite.');

      if (data.sameAsOriginal) {
        setError(data.reason || 'That matches the original sentence — change the flawed part first.');
        return;
      }

      setCheckResult(data);
      if (data.mastered) {
        setMasteredCount((n) => n + 1);
      }
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
        body: JSON.stringify({
          cardId: card.id,
          cardType: 'error',
          grade,
        }),
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

  return (
    <section className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-indigo-800">
            <RotateCcw className="h-3 w-3" />
            <span>Practise your mistakes · {card.category.replace(/_/g, ' ')}</span>
          </span>
          {card.card_format && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-stone-600">
              {card.card_format === 'cloze' ? 'Context repair' : 'Sentence fix'}
            </span>
          )}
          {(card.occurrence_count ?? 1) > 1 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              Seen {card.occurrence_count}×
            </span>
          )}
          <span className="text-xs text-stone-500">
            Card {index + 1} / {cards.length} · Reps {card.reps}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-3 rounded-xl border border-stone-200 bg-stone-50/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-800">
          Fix this sentence without hints:
        </p>
        <p className="text-base font-medium text-stone-900">&ldquo;{card.prompt_sentence}&rdquo;</p>
        {card.context_sentence && card.context_sentence !== card.prompt_sentence && (
          <p className="text-xs text-stone-600">
            Context: <span className="italic">{card.context_sentence}</span>
          </p>
        )}

        {!revealed ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <input
              type="text"
              value={attempt}
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
          <div className="space-y-3 pt-1">
            {checkResult?.fixed && checkResult.mastered ? (
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
            ) : checkResult?.blockedByRecentReveal ? (
              <p className="text-xs font-semibold text-amber-800">
                You used a hint. Choose how well you remembered below.
              </p>
            ) : attempt.trim() ? (
              <p className="text-xs font-semibold text-amber-800">
                Your repair: &ldquo;{attempt.trim()}&rdquo;
                {checkResult?.reason ? ` — ${checkResult.reason}` : ' — compare your answer below, then choose a button.'}
              </p>
            ) : null}

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

            {!(checkResult?.fixed && checkResult.mastered) && (
              <div>
              <p className="mb-2 text-sm font-semibold">How well did you remember it?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRADES.map((g) => (
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
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-xs font-medium text-rose-700">{error}</p>}
    </section>
  );
}
