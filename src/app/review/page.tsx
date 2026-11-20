import Link from 'next/link';
import ErrorReviewStudio from '@/components/b1b2/ErrorReviewStudio';
import PracticeQuiz from '@/components/b1b2/PracticeQuiz';
import { loadDashboard, loadErrorReviewCards, loadMissedPracticeItems } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export default async function AdaptiveReviewPage() {
  const [{ signedIn, items }, { cards: errorCards }, { telemetry }] = await Promise.all([
    loadMissedPracticeItems(),
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
            Fluency Studio tracks missed grammar and collocation items plus AI error patterns so you can drill your specific gaps.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login?next=/review"
              className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              Sign in →
            </Link>
            <Link
              href="/curriculum"
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
            >
              Browse curriculum
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
            Corrections from your speaking and writing sessions plus missed lesson items are scheduled by FSRS right before forgetting.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
        >
          Back to dashboard
        </Link>
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

      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        {items.length > 0 ? (
          <>
            <h2 className="text-base font-bold text-stone-900">
              Resurfaced Practice Items ({items.length})
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              Switch to Active Recall (type it) to produce the exact grammar or collocation without looking at options.
            </p>
            <PracticeQuiz
              signedIn
              lessonId={items[0].lesson_id}
              items={items.map((item) => ({
                id: item.id,
                prompt: item.lesson_number
                  ? `[Lesson ${item.lesson_number}] ${item.prompt}`
                  : item.prompt,
                options: item.options,
                answer: item.answer,
                explanation: item.explanation,
              }))}
            />
          </>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm font-semibold text-stone-800">No missed practice items queued right now.</p>
            <p className="mt-1 text-xs text-stone-500">
              As you complete lessons, any incorrect answers automatically queue here for spaced reinforcement.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Link
                href="/vocabulary"
                className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
              >
                Practise vocabulary SRS
              </Link>
              <Link
                href="/curriculum"
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Continue lessons
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
