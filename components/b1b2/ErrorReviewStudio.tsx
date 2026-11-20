'use client';

import { useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { previewFsrsIntervals, type ReviewGrade } from '@/lib/b1b2/fsrs';
import type { ErrorReviewCardRow } from '@/lib/b1b2/types';

const GRADES: { grade: ReviewGrade; label: string }[] = [
  { grade: 'again', label: 'Again' },
  { grade: 'hard', label: 'Hard' },
  { grade: 'good', label: 'Good' },
  { grade: 'easy', label: 'Easy' },
];

export default function ErrorReviewStudio({ initialCards }: { initialCards: ErrorReviewCardRow[] }) {
  const [cards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-stone-800">No error review cards due right now.</p>
        <p className="mt-1 text-xs text-stone-500">
          Every mistake flagged in your AI writing and speaking sessions turns into a spaced FSRS repair card here.
        </p>
      </div>
    );
  }

  if (index >= cards.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-center">
        <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-700" />
        <h3 className="mt-2 font-serif text-lg font-bold text-emerald-950">
          Error repair session complete ({reviewed} cards)
        </h3>
        <p className="mt-1 text-xs text-emerald-800">
          FSRS has scheduled each correction right before your next expected forgetting point.
        </p>
      </div>
    );
  }

  const card = cards[index];
  const hints = previewFsrsIntervals(card);
  const matched =
    attempt.trim().toLowerCase().replace(/[.!?]+$/, '') ===
    card.corrected_sentence.trim().toLowerCase().replace(/[.!?]+$/, '');

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
      setReviewed((n) => n + 1);
      setIndex((i) => i + 1);
      setAttempt('');
      setRevealed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save review.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-indigo-800">
            <RotateCcw className="h-3 w-3" />
            <span>FSRS Mistake Repair · {card.category.replace(/_/g, ' ')}</span>
          </span>
          <span className="text-xs text-stone-500">
            Card {index + 1} / {cards.length} · Reps {card.reps}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-3 rounded-xl border border-stone-200 bg-stone-50/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-800">
          Rewrite this sentence accurately:
        </p>
        <p className="text-base font-medium text-stone-900">&ldquo;{card.prompt_sentence}&rdquo;</p>

        {!revealed ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <input
              type="text"
              value={attempt}
              onChange={(e) => setAttempt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setRevealed(true);
                }
              }}
              placeholder="Type your corrected version…"
              className="flex-1 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm text-stone-900 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
            >
              Check &amp; reveal
            </button>
          </div>
        ) : (
          <div className="space-y-2.5 pt-1">
            {attempt.trim() && (
              <p className={`text-xs font-semibold ${matched ? 'text-emerald-700' : 'text-amber-700'}`}>
                {matched ? 'Spot on!' : `Your repair: "${attempt.trim()}"`}
              </p>
            )}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
              <p className="font-semibold text-emerald-950">{card.corrected_sentence}</p>
              <p className="mt-1 text-xs text-stone-700">{card.explanation}</p>
            </div>

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

      {error && <p className="mt-3 text-xs text-rose-700">{error}</p>}
    </section>
  );
}
