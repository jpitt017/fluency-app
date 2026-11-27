'use client';

import { ACTION_BUTTON_CLASS } from '@/lib/curriculum/week-tasks.mjs';
import Link from 'next/link';
import { useId } from 'react';
import { practiceScoreBand } from '@/lib/curriculum/week-practice.mjs';

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
      <p role="alert" className="text-sm font-medium text-red-700">
        Not saved. {error}
      </p>
    );
  }
  if (saving) return <p className="text-sm text-stone-500">Saving…</p>;
  if (!saved) return null;
  return (
    <p role="status" className="text-sm font-medium text-emerald-800">
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
 * What the learner reads after finishing, and again after a reload. The server
 * supplies the score; the same thresholds choose the matching actions here.
 */
export function FinishSummary({
  title,
  skill,
  summary,
  nextLabel,
  nextHref,
  onRevisit,
  onNext,
}: {
  title: string;
  skill: 'grammar' | 'vocabulary';
  summary: PracticeSummary;
  nextLabel: string;
  nextHref: string;
  /** Reopens step 1 and focuses the examples or words. */
  onRevisit: () => void;
  /** Scrolls in-page instead of navigating, for "#..." targets. */
  onNext?: () => void;
}) {
  const headingId = useId();
  const band = practiceScoreBand(summary);
  const primaryAction = ACTION_BUTTON_CLASS;
  const secondaryAction = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-indigo-700 bg-white px-4 py-2 text-sm font-semibold text-indigo-700';
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
        <>
          <p className="text-sm text-emerald-900">Your latest answers may not match this score. Press Finish again to update it.</p>
          <p className="text-sm text-amber-900">New mistakes may not be in Review yet.</p>
        </>
      ) : summary.answered < summary.total ? (
        <p className="text-sm text-emerald-900">After checking more answers, press Finish again to update your score.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {band === 'low' && (
          <button type="button" onClick={onRevisit} className={primaryAction}>
            {skill === 'grammar' ? 'Read the examples again' : 'Look at the words again'}
          </button>
        )}
        {(band === 'low' || band === 'middle') && (
          <Link href="/review" prefetch={false} className={band === 'low' ? secondaryAction : primaryAction}>
            {skill === 'grammar' ? 'Practise my mistakes' : 'Practise my words'}
          </Link>
        )}
        {(band === 'middle' || band === 'high' || band === 'none') && (
          onNext ? (
            <button type="button" onClick={onNext} className={band === 'middle' ? secondaryAction : primaryAction}>
              {nextLabel}
            </button>
          ) : (
            <a href={nextHref} className={band === 'middle' ? secondaryAction : primaryAction}>
              {nextLabel}
            </a>
          )
        )}
      </div>
    </section>
  );
}
