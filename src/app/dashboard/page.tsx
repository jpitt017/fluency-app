import Link from 'next/link';
import { WeeklyPaceSelector } from '@/components/b1b2/DashboardControls';
import WeekProgressList from '@/components/b1b2/WeekProgressList';
import { loadDashboard, loadHeaderSummary, loadObservabilitySummary, loadReviewQueue } from '@/lib/b1b2/data';
import AiUsageDisclosure from '@/components/b1b2/AiUsageDisclosure';
import RefreshCurrentWeekOnVisit from '@/components/b1b2/RefreshCurrentWeekOnVisit';
import { currentLearnerWeek } from '@/lib/curriculum/current-week';
import { learnerWeekFromParam, loadSyllabusContent } from '@/lib/curriculum/syllabus';
import { loadWeekProgress } from '@/lib/curriculum/week-progress';

export const dynamic = 'force-dynamic';
type DashboardProps = { searchParams: Promise<{ week?: string | string[] }> };

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const param = (await searchParams).week;
  const currentWeek = await currentLearnerWeek();
  const [summary, data, syllabus, review] = await Promise.all([
    loadHeaderSummary(), loadDashboard(), loadSyllabusContent(currentWeek), loadReviewQueue(),
  ]);
  const weekNumber = !summary.signedIn && param ? learnerWeekFromParam(param) : currentWeek;
  const weekProgress = await loadWeekProgress(data.userId, weekNumber);
  const week = syllabus.weeks.find((item) => item.number === weekNumber);
  const staff = summary.role === 'teacher' || summary.role === 'admin';
  const obs = staff ? await loadObservabilitySummary(7) : null;
  if (!data.signedIn) return <main className="mx-auto max-w-3xl px-4 py-16">
    <h1 className="font-serif text-3xl font-semibold">Your dashboard</h1>
    <p className="mt-3">See your goal for the week, practise your mistakes and check your progress.</p>
    <Link className="mt-5 inline-block rounded-xl bg-indigo-700 px-5 py-3 text-white" href="/login?next=/dashboard">Sign in</Link>
  </main>;
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
    <RefreshCurrentWeekOnVisit enabled currentWeek={currentWeek} />
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <h1 className="font-serif text-3xl font-semibold">Start this week</h1>
      <p className="mt-2 font-semibold">Week {weekNumber}: {week?.theme}</p>
      <p className="mt-2">By the end of this week I can… {week?.cefr.canDo}</p>
      <Link href={`/week/${weekNumber}`} className="mt-4 inline-block rounded-xl bg-indigo-700 px-5 py-3 font-semibold text-white">Start this week</Link>
    </section>
    <section className="rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="font-serif text-2xl font-semibold">Review</h2>
      <p className="mt-2">{review.totalDue} cards due today · {review.reviewedToday} cards finished today</p>
      <Link href="/review" className="mt-3 inline-block font-semibold text-indigo-700">Practise your mistakes →</Link>
    </section>
    <section className="rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="font-serif text-2xl font-semibold">Your progress</h2>
      <WeekProgressList week={weekNumber} progress={weekProgress} />
      <AiUsageDisclosure />
    </section>
    <WeeklyPaceSelector currentHours={data.weeklyGoalHours} />
    {staff && obs && <details className="rounded-xl border border-stone-200 bg-white p-5"><summary>Service statistics</summary>
      <p>Requests: {obs.total_requests} · Average: {obs.avg_latency_ms} ms · Failures: {obs.failure_count}</p>
      <p className="mt-1">TTS characters this month: {(obs.tts_monthly_chars ?? 0).toLocaleString('en-GB')} / {(obs.tts_monthly_char_limit ?? 40000).toLocaleString('en-GB')}</p>
    </details>}
  </main>;
}
