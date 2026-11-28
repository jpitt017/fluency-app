'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { findCollocationSpan } from '@/lib/b1b2/collocation-highlight.mjs';
import type { ReviewPracticeItem } from '@/lib/b1b2/types';

interface PracticeCheckResult {
  correct: boolean;
  nearly: boolean;
  feedback: string;
  correctSentence: string;
}

/**
 * Render an example sentence with the full collocation or target phrase
 * highlighted (e.g. "took a big risk", "make progress", "put the meeting off").
 */
export function HighlightedCollocation({
  sentence,
  target,
}: {
  sentence: string;
  target: string | null | undefined;
}) {
  if (!sentence) return null;
  const span = target ? findCollocationSpan(sentence, target) : null;
  if (!span) return <>{sentence}</>;
  const before = sentence.slice(0, span.start);
  const match = sentence.slice(span.start, span.end);
  const after = sentence.slice(span.end);
  return (
    <>
      {before}
      <strong className="rounded bg-amber-100 px-1 py-0.5 font-semibold not-italic text-stone-950">
        {match}
      </strong>
      {after}
    </>
  );
}

/**
 * Optional collapsible extra practice inside a Review card ("Practise this rule"
 * or "Practise this"). Instant deterministic checking — zero AI, never changes
 * card scheduling or daily counts.
 */
export default function ReviewExtraPractice({
  label,
  items,
}: {
  label: string;
  items: ReviewPracticeItem[];
}) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, PracticeCheckResult>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!items.length) return null;

  async function checkItem(item: ReviewPracticeItem, forcedAnswer?: string) {
    const value = (forcedAnswer ?? answers[item.id] ?? '').trim();
    if (!value) return;
    setBusyId(item.id);
    setErrors((prev) => ({ ...prev, [item.id]: '' }));
    try {
      const res = await fetch('/api/review/practice-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, answer: value }),
      });
      const data = (await res.json().catch(() => null)) as (PracticeCheckResult & { error?: string }) | null;
      if (!res.ok || !data || typeof data.correct !== 'boolean') {
        setErrors((prev) => ({
          ...prev,
          [item.id]: data?.error || 'We could not check that answer. Please try again.',
        }));
        return;
      }
      setResults((prev) => ({ ...prev, [item.id]: data }));
    } catch {
      setErrors((prev) => ({
        ...prev,
        [item.id]: 'We could not check that answer. Please try again.',
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-lg border border-indigo-200/80 bg-indigo-50/40 p-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-10 w-full items-center justify-between gap-2 text-left text-xs font-semibold text-indigo-900 hover:text-indigo-700"
      >
        <span>
          {label} ({items.length} {items.length === 1 ? 'quick item' : 'quick items'})
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-indigo-200/60 pt-3">
          <p className="text-[11px] text-stone-600">
            Extra practice — this does not change your review schedule.
          </p>
          {items.map((item, idx) => {
            const answer = answers[item.id] ?? '';
            const result = results[item.id];
            const itemError = errors[item.id];
            const isBusy = busyId === item.id;
            return (
              <div key={item.id} className="space-y-2 rounded-lg border border-stone-200 bg-white p-3">
                <p className="text-xs font-medium text-stone-900">
                  {idx + 1}. {item.prompt}
                </p>

                {item.options.length >= 2 ? (
                  <div className="flex flex-wrap gap-2">
                    {item.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={answer === option}
                        disabled={isBusy}
                        onClick={() => {
                          setAnswers((prev) => ({ ...prev, [item.id]: option }));
                          setResults((prev) => {
                            const next = { ...prev };
                            delete next[item.id];
                            return next;
                          });
                        }}
                        className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                          answer === option
                            ? 'border-indigo-700 bg-indigo-700 text-white'
                            : 'border-stone-300 bg-stone-50 text-stone-800 hover:border-indigo-400'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={answer}
                    aria-label={`Extra practice item ${idx + 1}`}
                    maxLength={400}
                    disabled={isBusy}
                    onChange={(e) => {
                      setAnswers((prev) => ({ ...prev, [item.id]: e.target.value }));
                      if (result) {
                        setResults((prev) => {
                          const next = { ...prev };
                          delete next[item.id];
                          return next;
                        });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void checkItem(item);
                      }
                    }}
                    placeholder={item.kind === 'gap' ? 'Type the missing word(s)…' : 'Type your sentence…'}
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 focus:border-indigo-500 focus:outline-none"
                  />
                )}

                <button
                  type="button"
                  disabled={isBusy || !answer.trim()}
                  onClick={() => void checkItem(item)}
                  className="rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                >
                  {isBusy ? 'Checking…' : 'Check'}
                </button>

                {result && (
                  <div
                    role="status"
                    className={`rounded-md p-2 text-xs ${
                      result.correct
                        ? 'bg-emerald-50 text-emerald-900'
                        : 'bg-amber-50 text-amber-950'
                    }`}
                  >
                    <p className="font-semibold">
                      {result.correct ? 'Correct! ' : result.nearly ? '' : 'Not quite. '}
                      <span className="font-normal">{result.feedback}</span>
                    </p>
                    {!result.correct && (
                      <p className="mt-1 font-medium text-emerald-900">
                        Correct sentence: {result.correctSentence}
                      </p>
                    )}
                  </div>
                )}
                {itemError && <p role="alert" className="text-xs text-rose-700">{itemError}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
