import Link from 'next/link';
import ErrorReviewStudio from '@/components/b1b2/ErrorReviewStudio';
import MediationTask from '@/components/b1b2/MediationTask';
import { loadDashboard, loadReviewQueue } from '@/lib/b1b2/data';
import { currentLearnerWeek } from '@/lib/curriculum/current-week';
import { learnerWeekFromParam, loadSyllabusContent } from '@/lib/curriculum/syllabus';
import RefreshCurrentWeekOnVisit from '@/components/b1b2/RefreshCurrentWeekOnVisit';

export const dynamic = 'force-dynamic';

type ReviewProps = { searchParams: Promise<{ week?: string | string[] }> };

export default async function AdaptiveReviewPage({ searchParams }: ReviewProps) {
  const weekParam = (await searchParams).week;
  const weekNumber = weekParam ? learnerWeekFromParam(weekParam) : await currentLearnerWeek();
  const [{ queue, signedIn, totalDue }, { telemetry }, syllabusContent] = await Promise.all([
    loadReviewQueue(),
    loadDashboard(),
    loadSyllabusContent(weekNumber),
  ]);
  const week = syllabusContent.weeks.find((item) => item.number === weekNumber);

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Your review</span>
          <h1 className="mt-2 text-2xl font-bold text-stone-900">Sign in to practise your mistakes</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Sign in to practise mistakes from your speaking and writing.
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
              Open Practice
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <RefreshCurrentWeekOnVisit enabled={signedIn} currentWeek={!weekParam ? weekNumber : undefined} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Your review</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-stone-900">Practise your mistakes</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Your mistakes come back here just before you forget them.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/labs"
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
          >
            Open Practice →
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
            Mistakes to practise
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

      {week?.mediation && <MediationTask weekNumber={weekNumber} task={week.mediation} />}

      {/* The cap line, above the cards. Suppressed for a signed-out visitor and
          when nothing is due, where it would say nothing useful. */}
      {totalDue > 0 && (
        <p className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-800">
          {queue.summary}
        </p>
      )}

      <ErrorReviewStudio initialCards={queue.cards} plan={queue} />
    </main>
  );
}
