import Link from 'next/link';
import { WeeklyPaceSelector, WeeklyReportCard } from '@/components/b1b2/DashboardControls';
import { loadDashboard, loadHeaderSummary, loadObservabilitySummary } from '@/lib/b1b2/data';
import AiUsageDisclosure from '@/components/b1b2/AiUsageDisclosure';
import RefreshCurrentWeekOnVisit from '@/components/b1b2/RefreshCurrentWeekOnVisit';
import { currentLearnerWeek } from '@/lib/curriculum/current-week';
import { learnerWeekFromParam, loadSyllabusContent } from '@/lib/curriculum/syllabus';
import type { SkillArea } from '@/lib/b1b2/types';

export const dynamic = 'force-dynamic';
type DashboardProps = { searchParams: Promise<{ week?: string | string[] }> };

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const param = (await searchParams).week;
  const currentWeek = await currentLearnerWeek();
  const [summary, data, syllabus] = await Promise.all([
    loadHeaderSummary(), loadDashboard(), loadSyllabusContent(currentWeek),
  ]);
  const weekNumber = !summary.signedIn && param ? learnerWeekFromParam(param) : currentWeek;
  const week = syllabus.weeks.find((item) => item.number === weekNumber);
  const staff = summary.role === 'teacher' || summary.role === 'admin';
  const obs = staff ? await loadObservabilitySummary(7) : null;
  const skills: { key: SkillArea; label: string; action: string }[] = [
    { key: 'reading', label: 'Reading', action: 'Read this week’s text' },
    { key: 'listening', label: 'Listening', action: 'Open this week’s listening' },
    { key: 'speaking', label: 'Speaking', action: 'Practise speaking' },
    { key: 'writing', label: 'Writing', action: 'Practise writing' },
    { key: 'grammar', label: 'Grammar', action: 'Practise this week’s grammar' },
    { key: 'vocabulary', label: 'Vocabulary', action: 'Practise this week’s words' },
  ];
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
      <h2 className="font-serif text-2xl font-semibold">Review your mistakes</h2>
      <p className="mt-2">{data.telemetry.dueErrorCards} cards to review today.</p>
      <Link href="/review" className="mt-3 inline-block font-semibold text-indigo-700">Practise your mistakes →</Link>
    </section>
    <section className="rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="font-serif text-2xl font-semibold">Your progress</h2>
      <p className="mt-2">You have studied for {data.dashboard?.streak_days ?? 0} days in a row.</p>
      <AiUsageDisclosure />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {skills.map((skill) => <Link key={skill.key} href={`/week/${weekNumber}#${skill.key}-practice`} prefetch={false} className="rounded-xl border border-stone-200 p-4 hover:border-indigo-400">
          <strong>{skill.label}</strong><p className="mt-1 text-sm text-stone-600">{Math.round(Number(data.dashboard?.skills?.[skill.key]?.score ?? 0))}%</p>
          <p className="mt-2 text-sm font-semibold text-indigo-700">{skill.action} →</p>
        </Link>)}
      </div>
    </section>
    <div className="grid gap-6 md:grid-cols-2"><WeeklyPaceSelector currentHours={data.weeklyGoalHours} /><WeeklyReportCard report={data.weeklyReport} /></div>
    {staff && obs && <details className="rounded-xl border border-stone-200 bg-white p-5"><summary>Service statistics</summary>
      <p>Requests: {obs.total_requests} · Average: {obs.avg_latency_ms} ms · Failures: {obs.failure_count}</p>
    </details>}
  </main>;
}
