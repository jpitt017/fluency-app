import Link from 'next/link';
import ErrorReviewStudio from '@/components/b1b2/ErrorReviewStudio';
import { loadDashboard, loadErrorReviewCards } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export default async function AdaptiveReviewPage() {
  const [{ cards: errorCards, signedIn }, { telemetry }] = await Promise.all([
    loadErrorReviewCards(),
    loadDashboard(),
  ]);

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Adaptive Review</span>
          <h1 className="mt-2 text-2xl font-bold text-stone-900">Sign in to practise your recurring mistakes</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Fluency Studio tracks AI error patterns from your speaking and writing sessions so you can drill your specific gaps with FSRS spaced repetition.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login?next=/review"
              className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              Sign in →
            </Link>
            <Link
              href="/labs"
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
            >
              Open AI Labs
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Personalised FSRS Review</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-stone-900">Mistake &amp; Pattern Drill</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Corrections from your speaking and writing sessions are scheduled by FSRS right before forgetting.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/labs"
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
          >
            Open AI Labs →
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            Back to dashboard
          </Link>
        </div>
      </div>

      {telemetry.recurringErrors.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900">
            Recurring patterns tracked in your error ledger
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {telemetry.recurringErrors.map((err) => (
              <span
                key={err.tag}
                className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-stone-800"
              >
                {err.label}{' '}
                <span className="text-amber-800">
                  ({err.count}× total{err.weeklyCount ? ` · ${err.weeklyCount}× this week` : ''})
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      <ErrorReviewStudio initialCards={errorCards} />
    </main>
  );
}
