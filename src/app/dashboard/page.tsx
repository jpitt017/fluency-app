import Link from 'next/link';
import WeeklyReportButton from '@/components/b1b2/WeeklyReportButton';
import { getViewer, loadDashboard, loadOutline } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Your progress',
};

const SKILL_ORDER = ['grammar', 'vocabulary', 'listening', 'reading', 'speaking', 'writing'] as const;

const BAND_LABEL: Record<string, string> = {
  B1_low: 'B1 low',
  B1_mid: 'B1 mid',
  B1_high: 'B1 high',
  B1_plus: 'B1+',
  B2_entry: 'B2 entry',
  B2_developing: 'B2 developing',
  B2_solid: 'B2 solid',
};

export default async function DashboardPage() {
  const viewer = await getViewer();

  if (!viewer.signedIn) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold text-slate-900">Your progress</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to see XP, your streak, badges, skill meters and the weekly report.
        </p>
        <Link href="/login" className="mt-6 inline-block rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700">
          Sign in
        </Link>
      </main>
    );
  }

  const [{ dashboard, weekly, badges }, outline] = await Promise.all([loadDashboard(), loadOutline()]);

  const lessons = outline?.modules.flatMap((module) => module.lessons) ?? [];
  const completed = lessons.filter((lesson) => lesson.status === 'completed').length;
  const totalLessons = lessons.length || 64;
  const nextLesson =
    dashboard?.next_lesson ??
    (lessons.find((lesson) => lesson.status !== 'completed')
      ? {
          lesson_number: lessons.find((lesson) => lesson.status !== 'completed')!.number,
          title: lessons.find((lesson) => lesson.status !== 'completed')!.title,
          can_do: lessons.find((lesson) => lesson.status !== 'completed')!.can_do,
          module_title: '',
        }
      : null);

  const skillFallback = SKILL_ORDER.map((skill) => {
    const relevant = lessons.filter((lesson) => lesson.skill === skill);
    const done = relevant.filter((lesson) => lesson.status === 'completed').length;
    const score = relevant.length ? Math.round((done / relevant.length) * 100) : 0;
    return { skill, score, lessons: done };
  });

  const hasRpcSkills = dashboard?.skills && Object.keys(dashboard.skills).length > 0;
  const skills = hasRpcSkills
    ? SKILL_ORDER.map((skill) => ({
        skill,
        score: Math.round(dashboard?.skills?.[skill]?.score ?? 0),
        lessons: dashboard?.skills?.[skill]?.lessons ?? 0,
      }))
    : skillFallback;

  const earnedCodes = new Set((dashboard?.badges ?? []).map((badge) => badge.code));
  const displayName = dashboard?.profile?.display_name || dashboard?.profile?.full_name || 'Learner';
  const band = dashboard?.learner_band ? BAND_LABEL[dashboard.learner_band] ?? dashboard.learner_band : 'B1 low';

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">B1 → B2 · {band}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{displayName}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {completed} / {totalLessons} lessons · {dashboard?.xp_total ?? 0} XP · {dashboard?.streak_days ?? 0}-day streak
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/review" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Review {dashboard?.due_cards ? `(${dashboard.due_cards})` : ''}
          </Link>
          <Link href="/curriculum" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Curriculum
          </Link>
          {nextLesson && (
            <Link href={`/curriculum/lessons/${nextLesson.lesson_number}`} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              {completed ? 'Continue' : 'Start'} · Lesson {nextLesson.lesson_number}
            </Link>
          )}
        </div>
      </header>

      <section className="mb-6 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-900">
            {nextLesson ? `Next up: ${nextLesson.title}` : 'Course complete'}
          </p>
          <span className="text-xs font-semibold text-slate-600">{Math.round((completed / totalLessons) * 100)}% of the course</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(100, (completed / totalLessons) * 100)}%` }} />
        </div>
        {nextLesson?.can_do && <p className="mt-2 text-xs text-slate-600">{nextLesson.can_do}</p>}
      </section>

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-900">Skill meters</h2>
          <p className="mt-1 text-xs text-slate-500">Completed lesson work per skill, blended with checkpoint evidence.</p>
          <div className="mt-4 space-y-3">
            {skills.map(({ skill, score, lessons: done }) => (
              <div key={skill}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-semibold capitalize text-slate-700">{skill}</span>
                  <span className="text-slate-500">
                    {score}%{done ? ` · ${done} lessons` : ''}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(100, score)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">This week</h2>
              <p className="mt-1 text-xs text-slate-500">
                {weekly ? `Week of ${new Date(weekly.week_start).toLocaleDateString()}` : 'No report yet — study for a few days, then build one.'}
              </p>
            </div>
            <WeeklyReportButton />
          </div>
          {weekly ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Study time</dt>
                <dd className="text-lg font-bold text-slate-900">{weekly.study_minutes ?? 0} min</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Words learned</dt>
                <dd className="text-lg font-bold text-slate-900">{weekly.words_learned ?? 0}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Recordings</dt>
                <dd className="text-lg font-bold text-slate-900">{weekly.recordings ?? 0}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Writing tasks</dt>
                <dd className="text-lg font-bold text-slate-900">{weekly.writing_tasks ?? 0}</dd>
              </div>
              {weekly.weakest_skill && (
                <div className="col-span-2 rounded-lg bg-amber-50 p-3">
                  <dt className="text-xs text-amber-800">Weakest skill this week</dt>
                  <dd className="text-sm font-semibold capitalize text-amber-900">{weekly.weakest_skill}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              Your report counts minutes, new words, recordings and writing tasks, then names the skill to work on next.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">Badges</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {earnedCodes.size} / {badges.length || 5} earned
          </span>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((badge) => {
            const earned = earnedCodes.has(badge.code);
            return (
              <li key={badge.id} className={`rounded-xl border p-3 ${earned ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden>
                    {badge.icon}
                  </span>
                  <p className={`text-sm font-semibold ${earned ? 'text-emerald-950' : 'text-slate-700'}`}>{badge.title}</p>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{badge.description}</p>
                <p className={`mt-1 text-[11px] font-semibold ${earned ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {earned ? `Earned · +${badge.xp_reward} XP` : `Locked · +${badge.xp_reward} XP`}
                </p>
              </li>
            );
          })}
          {!badges.length && <li className="text-sm text-slate-600">No badges are published yet.</li>}
        </ul>
      </section>
    </main>
  );
}
