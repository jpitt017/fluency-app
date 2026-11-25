'use client';

import { useId } from 'react';

/**
 * The two small pieces both practices share once they can be finished: the
 * "Saved ✓" line after a check, and the panel that follows "Finish grammar" /
 * "Finish vocabulary".
 *
 * Kept together so the grammar section and the vocabulary section cannot end in
 * different ways, which is how they started.
 */

/**
 * "Saved ✓" after an answer is checked.
 *
 * It is a `role="status"`, so a screen reader announces it rather than leaving a
 * tick as a decoration. Text, not only a symbol: a tick alone is ambiguous in
 * some fonts and invisible to some assistive technology.
 */
export function SavedTick({ saved, error, saving }: { saved: boolean; error?: string; saving?: boolean }) {
  if (error) {
    return (
      <p role="alert" className="text-xs font-medium text-red-700">
        Not saved. {error}
      </p>
    );
  }
  if (saving) return <p className="text-xs text-stone-500">Saving…</p>;
  if (!saved) return null;
  return (
    <p role="status" className="text-xs font-medium text-emerald-800">
      Saved ✓
    </p>
  );
}

export type PracticeSummary = {
  answered: number;
  correct: number;
  wrong: number;
  total: number;
  reviewMistakes: number;
  sentence: string;
  /** Answers have changed since this saved snapshot. */
  scoreNeedsRefresh?: boolean;
};

/**
 * What the learner reads after finishing, and again after a reload.
 *
 * One short summary, then one button to where they go next. The count is the
 * server's; the component only displays it.
 */
export function FinishSummary({
  title,
  summary,
  nextLabel,
  nextHref,
  onNext,
}: {
  title: string;
  summary: PracticeSummary;
  nextLabel: string;
  nextHref: string;
  /** Scrolls in-page instead of navigating, for "#..." targets. */
  onNext?: () => void;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4"
    >
      <h3 id={headingId} className="font-semibold text-emerald-900">
        {title}
      </h3>
      <p role="status" className="text-sm text-emerald-950">
        {summary.sentence}
      </p>
      {summary.reviewMistakes < summary.wrong && (
        <p className="text-sm text-amber-900">Some mistakes may not be in Review yet. Press Finish again to add them.</p>
      )}
      {summary.scoreNeedsRefresh ? (
        <p className="text-sm text-emerald-900">Your latest answers may not match this score. Press Finish again to update it.</p>
      ) : summary.answered < summary.total ? (
        <p className="text-sm text-emerald-900">After checking more answers, press Finish again to update your score.</p>
      ) : null}
      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
        >
          {nextLabel}
        </button>
      ) : (
        <a
          href={nextHref}
          className="inline-block rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
        >
          {nextLabel}
        </a>
      )}
    </section>
  );
}
