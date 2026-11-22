import Link from 'next/link';
import IssueList from '@/components/b1b2/IssueList';
import TeacherConsoleClient from '@/components/b1b2/TeacherConsoleClient';
import { loadTeacherRoster } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Teacher Console · Fluency Studio',
};

export default async function TeacherPage({ searchParams }: { searchParams: Promise<{ tab?: string; type?: string; status?: string }> }) {
  const params = await searchParams;
  const { signedIn, authorized, learners } = await loadTeacherRoster();

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Teacher Console</span>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-900">
            Sign in with a teacher account
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Review learner progress, confirm speaking and writing outputs, add live pronunciation notes, and record B2 readiness decisions.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login?next=/teacher"
              className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              Sign in →
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Learner dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-amber-200 bg-white p-8 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Teacher Access Only</span>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-stone-900">
            This account does not have teacher permissions
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Only accounts with the <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">teacher</code> or{' '}
            <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">admin</code> role can view learner rosters, confirm outputs, and override AI grades.
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              Return to your dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
              Blended Live-Lesson Companion · Two Weekly Lessons (60 + 55 min)
            </span>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-stone-900">
              Teacher Review &amp; Readiness Console
            </h1>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-stone-600">
              Inspect learner pacing, top personal error patterns for live lessons, speaking transcripts with teacher pronunciation notes, and writing confirmations.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            Back to dashboard →
          </Link>
        </div>
      </header>

      <nav aria-label="Teacher console" className="flex gap-2">
        <Link href="/teacher" aria-current={params.tab !== 'issues' ? 'page' : undefined} className="rounded-lg border bg-white px-4 py-2">Learners</Link>
        <Link href="/teacher?tab=issues" aria-current={params.tab === 'issues' ? 'page' : undefined} className="rounded-lg border bg-white px-4 py-2">Issues</Link>
      </nav>
      {params.tab === 'issues' ? <IssueList type={params.type} status={params.status} /> : <TeacherConsoleClient learners={learners} />}
    </main>
  );
}
