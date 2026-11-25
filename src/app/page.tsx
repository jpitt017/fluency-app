import Link from 'next/link';
import {
  ArrowRight,
  Award,
  BookOpen,
  Compass,
  Flame,
  Headphones,
  Layers,
  MessageSquare,
  Mic,
  PenLine,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { formatBandLabel, loadDashboard } from '@/lib/b1b2/data';
import { currentLearnerWeek } from '@/lib/curriculum/current-week';
import type { SkillArea } from '@/lib/b1b2/types';

export const dynamic = 'force-dynamic';

const LIVE_SKILLS: { key: SkillArea; label: string; href: string; icon: typeof Mic }[] = [
  { key: 'grammar', label: 'Grammar', href: '/review', icon: Sparkles },
  { key: 'vocabulary', label: 'Vocabulary', href: '/review', icon: Layers },
  { key: 'listening', label: 'Listening', href: '/labs', icon: Headphones },
  { key: 'reading', label: 'Reading', href: '/labs', icon: MessageSquare },
  { key: 'speaking', label: 'Speaking', href: '/labs', icon: Mic },
  { key: 'writing', label: 'Writing', href: '/labs', icon: PenLine },
];

export default async function Home() {
  const [{ signedIn, dashboard, weeklyGoalHours, telemetry }, week] = await Promise.all([loadDashboard(), currentLearnerWeek()]);

  const streakDays = dashboard?.streak_days ?? 0;
  const dueErrors = telemetry.dueErrorCards;

  const liveSkills = LIVE_SKILLS.map((s) => ({
    ...s,
    href: s.key === 'reading' || s.key === 'listening' ? `/week/${week}` : s.key === 'speaking' || s.key === 'writing' ? `/labs?week=${week}#${s.key}` : s.href,
    score: Math.round(Number(dashboard?.skills?.[s.key]?.score ?? 0)),
  }));
  const weakestSkill =
    liveSkills.length > 0
      ? liveSkills.reduce((min, cur) => (cur.score < min.score ? cur : min), liveSkills[0])
      : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {signedIn ? (
        <section className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <div className="space-y-5 rounded-2xl border border-stone-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_10px_28px_-14px_rgba(24,24,27,0.08)] lg:col-span-7">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
              <span className="rounded-full bg-indigo-700 px-2.5 py-0.5 text-white">
                {formatBandLabel(dashboard?.learner_band)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800">
                <Flame className="h-3 w-3" />
                {streakDays}d streak
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-700">
                {weeklyGoalHours}h/wk goal
              </span>
            </div>

            <div>
              <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-stone-900 sm:text-3xl">
                Welcome back to Fluency Studio
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-stone-600">
                Practise speaking and writing. Review your mistakes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/labs"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-950/15 transition hover:-translate-y-0.5 hover:bg-indigo-800"
              >
                <Mic className="h-4 w-4" />
                <span>Open speaking and writing practice</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
              >
                <span>Your progress</span>
              </Link>
              <Link
                href={`/week/${week}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
              >
                <span>Start this week</span>
              </Link>
            </div>

            <div className="grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-2">
              <Link
                href="/review"
                className="group flex items-center justify-between rounded-xl border border-stone-200/80 bg-stone-50/70 p-3.5 transition hover:border-amber-300 hover:bg-amber-50/30"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                    <RotateCcw className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-stone-900">Practise your mistakes</p>
                    <p className="text-[11px] text-stone-600">
                      {dueErrors > 0 ? `${dueErrors} cards to practise today` : 'Nothing to practise today'}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-stone-400 group-hover:text-amber-700" />
              </Link>

              <Link
                href="/portfolio"
                className="group flex items-center justify-between rounded-xl border border-stone-200/80 bg-stone-50/70 p-3.5 transition hover:border-indigo-300 hover:bg-indigo-50/30"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                    <Award className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-stone-900">My work</p>
                    <p className="text-[11px] text-stone-600">
                      {telemetry.speakingCount + telemetry.writingCount} pieces of work checked
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-stone-400 group-hover:text-indigo-700" />
              </Link>
            </div>
          </div>

          <aside className="space-y-4 rounded-2xl border border-stone-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_12px_32px_-16px_rgba(24,24,27,0.08)] lg:col-span-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Your skills</p>
                <h2 className="font-serif text-lg font-semibold text-stone-900">How you are doing</h2>
              </div>
              {weakestSkill && (
                <Link
                  href={weakestSkill.href}
                  className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200/80 hover:bg-amber-100"
                >
                  Focus: {weakestSkill.label} →
                </Link>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {liveSkills.map(({ key, label, href, icon: Icon, score }) => {
                const isWeakest = weakestSkill?.key === key && score < 85;
                return (
                  <Link
                    key={key}
                    href={href}
                    className={`rounded-xl border p-2.5 transition hover:border-indigo-300 ${
                      isWeakest ? 'border-amber-200 bg-amber-50/30' : 'border-stone-100 bg-stone-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1 font-semibold text-stone-800">
                        <Icon className="h-3.5 w-3.5 text-indigo-600" />
                        {label}
                      </span>
                      <span className="font-mono font-bold text-indigo-700">{score}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-stone-200/70">
                      <div
                        className={`h-full rounded-full ${isWeakest ? 'bg-amber-500' : 'bg-indigo-600'}`}
                        style={{ width: `${Math.min(100, Math.max(4, score))}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2.5 border-t border-stone-100 pt-3">
              <Link href="/labs" className="rounded-xl bg-stone-50 p-3 transition hover:bg-stone-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Latest Speaking</p>
                <p className="mt-0.5 font-serif text-xl font-semibold text-stone-900">
                  {telemetry.speakingLatest !== null ? `${telemetry.speakingLatest}%` : '—'}
                </p>
                <p className="text-[11px] text-indigo-700">
                  {telemetry.speakingCount > 0 ? `${telemetry.speakingCount} checked` : 'Open speaking practice →'}
                </p>
              </Link>
              <Link href="/portfolio" className="rounded-xl bg-stone-50 p-3 transition hover:bg-stone-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Latest Writing</p>
                <p className="mt-0.5 font-serif text-xl font-semibold text-stone-900">
                  {telemetry.writingLatest !== null ? `${telemetry.writingLatest}%` : '—'}
                </p>
                <p className="text-[11px] text-indigo-700">
                  {telemetry.writingCount > 0 ? `${telemetry.writingCount} checked` : 'Open my work →'}
                </p>
              </Link>
            </div>
          </aside>
        </section>
      ) : (
        <section className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="space-y-5 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-stone-200/90 bg-white px-3.5 py-1 text-xs font-semibold text-stone-700 shadow-2xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>CEFR B1 → B2 · Fluency Studio</span>
            </div>

            <h1 className="font-serif text-3xl font-semibold leading-[1.1] tracking-tight text-stone-900 sm:text-4xl lg:text-[2.85rem]">
              A calm, focused workspace to reach{' '}
              <span className="italic text-indigo-700">solid B2 English.</span>
            </h1>

            <p className="max-w-xl text-sm leading-6 text-stone-600 sm:text-[15px]">
              Practise conversations and pronunciation. Get feedback on your writing.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/labs"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-950/15 transition hover:-translate-y-0.5 hover:bg-indigo-800"
              >
                <Mic className="h-4 w-4" />
                <span>Open speaking and writing practice</span>
              </Link>
              <Link
                href="/onboarding/placement"
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-2xs transition hover:border-stone-400 hover:bg-stone-50"
              >
                <Compass className="h-4 w-4 text-indigo-700" />
                <span>Placement Check</span>
              </Link>
              <Link
                href={`/week/${week}`}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-2xs transition hover:border-stone-400 hover:bg-stone-50"
              >
                <BookOpen className="h-4 w-4 text-indigo-700" />
                <span>Start this week</span>
              </Link>
            </div>
          </div>

          <aside className="space-y-3 rounded-2xl border border-stone-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_12px_32px_-16px_rgba(24,24,27,0.08)] lg:col-span-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Practice</p>
            <Link
              href="/labs"
              className="flex items-start gap-3 rounded-xl border border-stone-100 bg-stone-50/80 p-3.5 transition hover:border-indigo-200 hover:bg-indigo-50/30"
            >
              <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
              <div>
                <p className="text-xs font-bold text-stone-900">Writing and speaking practice</p>
                <p className="mt-0.5 text-xs text-stone-600">
                  See what you said and get feedback.
                </p>
              </div>
            </Link>
            <Link
              href="/review"
              className="flex items-start gap-3 rounded-xl border border-stone-100 bg-stone-50/80 p-3.5 transition hover:border-indigo-200 hover:bg-indigo-50/30"
            >
              <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <p className="text-xs font-bold text-stone-900">Practise your mistakes</p>
                <p className="mt-0.5 text-xs text-stone-600">
                  Practise the mistakes from your speaking and writing.
                </p>
              </div>
            </Link>
            <Link
              href="/portfolio"
              className="flex items-start gap-3 rounded-xl border border-stone-100 bg-stone-50/80 p-3.5 transition hover:border-indigo-200 hover:bg-indigo-50/30"
            >
              <Award className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <div>
                <p className="text-xs font-bold text-stone-900">My work</p>
                <p className="mt-0.5 text-xs text-stone-600">
                  Listen to your recordings and read feedback on your writing.
                </p>
              </div>
            </Link>
          </aside>
        </section>
      )}
    </main>
  );
}
