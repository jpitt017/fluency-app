import Link from 'next/link';
import { loadOutline } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export default async function CheckpointsPage() {
  const outline = await loadOutline();
  const checkpoints = outline?.checkpoints ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Milestone Assessments</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-stone-900">B1 → B2 Checkpoints</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Four timed milestone exams at the end of Weeks 4, 8, 12, and 16 combining input comprehension, grammar/lexis diagnostics, speaking, and writing—confirmed by your teacher.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
        >
          Back to dashboard
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {checkpoints.map((cp) => {
          const done = cp.status === 'completed';
          return (
            <div key={cp.code} className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-6">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">{cp.code}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      done ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {done ? 'Completed' : cp.timing}
                  </span>
                </div>
                <h2 className="mt-3 font-serif text-xl font-bold text-stone-900">{cp.title}</h2>
                {cp.module && <p className="mt-1 text-xs font-medium text-stone-500">Week {cp.module} Milestone</p>}
                <p className="mt-2 text-sm leading-6 text-stone-600">{cp.description}</p>
              </div>

              <div className="mt-5">
                <Link
                  href={`/checkpoints/${cp.code}`}
                  className="inline-flex items-center rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-stone-800"
                >
                  {done ? 'Review or retake' : `Start ${cp.code} assessment →`}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
