import Link from 'next/link';
import {
  BookOpen,
  ArrowRight,
  Award,
  Compass,
  Headphones,
  Layers,
  MessageSquare,
  Mic,
  PenLine,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { WeeklyPaceSelector, WeeklyReportCard } from '@/components/b1b2/DashboardControls';
import { formatBandLabel, loadDashboard, loadObservabilitySummary } from '@/lib/b1b2/data';
import type { SkillArea } from '@/lib/b1b2/types';
import { learnerWeekFromParam, loadSyllabusContent } from '@/lib/curriculum/syllabus';

export const dynamic = 'force-dynamic';

const SKILLS: {
  key: SkillArea;
  label: string;
  href: string;
  cta: string;
  icon: typeof Sparkles;
}[] = [
  { key: 'grammar', label: 'Grammar', href: '/review', cta: 'Mistake drill', icon: Sparkles },
  { key: 'vocabulary', label: 'Vocabulary', href: '/review', cta: 'Error cards', icon: Layers },
  { key: 'listening', label: 'Listening', href: '/labs', cta: 'Shadow audio', icon: Headphones },
  { key: 'reading', label: 'Reading', href: '/labs', cta: 'Role-play lab', icon: MessageSquare },
  { key: 'speaking', label: 'Speaking', href: '/labs', cta: 'Speaking lab', icon: Mic },
  { key: 'writing', label: 'Writing', href: '/labs', cta: 'Writing studio', icon: PenLine },
];

type DashboardProps = { searchParams: Promise<{ week?: string | string[] }> };

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const weekNumber = learnerWeekFromParam((await searchParams).week);
  const [{ signedIn, dashboard, recentXp, weeklyGoalHours, weeklyReport, subscriptionStatus, telemetry }, obs, syllabusContent] =
    await Promise.all([loadDashboard(), loadObservabilitySummary(7), loadSyllabusContent()]);
  const week = syllabusContent.weeks.find((item) => item.number === weekNumber);

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_12px_32px_-16px_rgba(24,24,27,0.08)]">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Study Workspace</span>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-900">
            Sign in to open your Fluency Studio dashboard
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Track your weekly study pace, review FSRS mistake-repair cards, monitor skill meters, and save AI speaking and writing feedback.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login?next=/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-800"
            >
              <span>Sign in</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/labs"
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Open AI Labs
            </Link>
            <Link
              href="/onboarding/placement"
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Placement check
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const streakDays = dashboard?.streak_days ?? 0;
  const totalReviewQueue = telemetry.dueErrorCards;
  const bandLabel = formatBandLabel(dashboard?.learner_band);
  const badges = dashboard?.badges ?? [];

  const skillEntries = SKILLS.map((s) => ({
    ...s,
    score: Math.round(Number(dashboard?.skills?.[s.key]?.score ?? 0)),
  }));
  const weakestSkill =
    skillEntries.length > 0
      ? skillEntries.reduce((min, cur) => (cur.score < min.score ? cur : min), skillEntries[0])
      : null;

  const wordBaselinePct = Math.min(
    100,
    Math.round((telemetry.totalWordsEvaluated / Math.max(1, telemetry.minWordsRequired)) * 100),
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_10px_28px_-14px_rgba(24,24,27,0.08)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full bg-indigo-700 px-2.5 py-0.5 text-white">{bandLabel}</span>
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-700">
                {weeklyGoalHours}h / week target
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-700">
                {streakDays}d streak
              </span>
              {subscriptionStatus === 'active' || subscriptionStatus === 'trialing' ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800">Pro Member</span>
              ) : (
                <Link href="/pricing" className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800 hover:underline">
                  Core free · Upgrade →
                </Link>
              )}
            </div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
              English B1 → B2 Study Workspace
            </h1>
            <p className="text-sm text-stone-600">
              Practise speaking, writing, and shadowing in the AI Labs and drill recurring error patterns with FSRS.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2.5">
            <Link
              href="/labs"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-950/15 transition hover:-translate-y-0.5 hover:bg-indigo-800"
            >
              <Mic className="h-4 w-4" />
              <span>AI Labs</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/review"
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-800 shadow-2xs transition hover:bg-stone-50"
            >
              <RotateCcw className="h-4 w-4 text-amber-700" />
              <span>Error Review</span>
            </Link>
            <Link
              href="/curriculum"
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-800 shadow-2xs transition hover:bg-stone-50"
            >
              <BookOpen className="h-4 w-4 text-indigo-700" />
              <span>32-week plan</span>
            </Link>
          </div>
        </div>
      </section>

      {week && (
        <section aria-label="Weekly CEFR target" className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-800">
              Week {week.number} · Your CEFR target
            </p>
            <nav aria-label="Choose week" className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-emerald-900">
              {[1, 4, 8, 12].map((number) => (
                <Link
                  key={number}
                  href={`/dashboard?week=${number}`}
                  className={`rounded-full border px-2.5 py-1 ${
                    weekNumber === number
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-emerald-200 bg-white hover:border-emerald-400'
                  }`}
                >
                  Week {number}
                </Link>
              ))}
            </nav>
          </div>
          <p className="mt-3 text-sm font-semibold text-emerald-950">By the end of this week I can…</p>
          <Link href={`/week/${week.number}`} className="mt-1 block font-serif text-xl leading-snug text-stone-900 underline decoration-emerald-400 underline-offset-4 sm:text-2xl">{week.cefr.canDo}</Link>
          <p className="mt-2 text-xs text-emerald-800">
            {week.cefr.scale} · Level {week.cefr.level}
          </p>
        </section>
      )}

      <section aria-label="Skill telemetry" className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/review"
          className="group block rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Mistake Repair</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <RotateCcw className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-serif text-3xl font-semibold text-stone-900">
            {totalReviewQueue}{' '}
            <span className="font-sans text-base font-medium text-stone-400">due</span>
          </p>
          <p className="mt-2 flex items-center justify-between text-xs text-stone-500">
            <span>{telemetry.masteredErrorCards} mastered</span>
            <span className="font-semibold text-indigo-700 group-hover:underline">Open drill →</span>
          </p>
        </Link>

        <Link
          href="/portfolio"
          className="group block rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Speaking Growth</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
              <Mic className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-serif text-3xl font-semibold text-stone-900">
            {telemetry.speakingLatest !== null ? `${telemetry.speakingLatest}%` : '—'}
          </p>
          <p className="mt-2 flex items-center justify-between text-xs text-stone-500">
            <span>
              {telemetry.speakingCount > 0
                ? `${telemetry.speakingCount} evaluated${
                    telemetry.speakingDelta !== null
                      ? ` (${telemetry.speakingDelta >= 0 ? `+${telemetry.speakingDelta}` : telemetry.speakingDelta}%)`
                      : ''
                  }`
                : 'Record 1st clip in Labs'}
            </span>
            <span className="font-semibold text-indigo-700 group-hover:underline">Archive →</span>
          </p>
        </Link>

        <Link
          href="/portfolio"
          className="group block rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Writing Growth</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <PenLine className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-serif text-3xl font-semibold text-stone-900">
            {telemetry.writingLatest !== null ? `${telemetry.writingLatest}%` : '—'}
          </p>
          <p className="mt-2 flex items-center justify-between text-xs text-stone-500">
            <span>
              {telemetry.writingCount > 0
                ? `${telemetry.writingCount} evaluated${
                    telemetry.writingDelta !== null
                      ? ` (${telemetry.writingDelta >= 0 ? `+${telemetry.writingDelta}` : telemetry.writingDelta}%)`
                      : ''
                  }`
                : 'Submit 1st draft in Labs'}
            </span>
            <span className="font-semibold text-indigo-700 group-hover:underline">Archive →</span>
          </p>
        </Link>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-serif text-xl font-semibold text-stone-900">
                  Adaptive Focus &amp; Error Density
                </h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  Normalized per 100 words written or spoken · {telemetry.masteredErrorCards} repair cards mastered
                </p>
              </div>
              <div className="flex items-center gap-2">
                {telemetry.hasEnoughWordData && telemetry.errorsPer100Words !== null ? (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
                    {telemetry.errorsPer100Words} / 100w
                    {telemetry.hasEnoughTrendData && telemetry.errorsPer100WordsDelta !== null
                      ? ` (${telemetry.errorsPer100WordsDelta <= 0 ? telemetry.errorsPer100WordsDelta : `+${telemetry.errorsPer100WordsDelta}`})`
                      : ''}
                  </span>
                ) : (
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-600">
                    Baseline: {telemetry.totalWordsEvaluated}/{telemetry.minWordsRequired} words
                  </span>
                )}
                <Link href="/review" className="text-xs font-semibold text-indigo-700 hover:underline">
                  Drill mistakes →
                </Link>
              </div>
            </div>

            {!telemetry.hasEnoughWordData && (
              <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50/80 p-3">
                <div className="flex items-center justify-between text-[11px] font-medium text-stone-600">
                  <span>Collecting 200-word speaking &amp; writing sample for reliable error-rate tracking</span>
                  <span className="font-mono font-semibold text-stone-800">{wordBaselinePct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-stone-200/70">
                  <div className="h-full rounded-full bg-indigo-600" style={{ width: `${wordBaselinePct}%` }} />
                </div>
              </div>
            )}

            {telemetry.recurringErrors.length > 0 ? (
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {telemetry.recurringErrors.map((err) => (
                  <Link
                    key={err.tag}
                    href="/review"
                    className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-amber-50/40 px-3.5 py-2.5 text-xs transition hover:border-amber-300"
                  >
                    <div className="min-w-0">
                      <span className="block truncate font-semibold text-stone-800">{err.label}</span>
                      <span className="text-[11px] text-stone-500">
                        {telemetry.hasEnoughWordData
                          ? `${err.per100Words} / 100 words${
                              telemetry.hasEnoughTrendData && err.per100WordsPrev !== null
                                ? ` (prev ${err.per100WordsPrev})`
                                : ''
                            }`
                          : `${err.count}× logged`}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
                        telemetry.hasEnoughTrendData && err.trend === 'improving'
                          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                          : telemetry.hasEnoughTrendData && err.trend === 'worsening'
                            ? 'bg-rose-50 text-rose-800 ring-rose-200'
                            : 'bg-white text-amber-800 ring-amber-200'
                      }`}
                    >
                      {telemetry.hasEnoughTrendData && err.trend === 'improving'
                        ? '↓ improving'
                        : telemetry.hasEnoughTrendData && err.trend === 'worsening'
                          ? '↑ watch'
                          : `${err.count}×`}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-stone-100 bg-stone-50/80 p-3.5 text-xs leading-5 text-stone-600">
                Complete AI speaking and writing tasks in the Labs to populate your personalised error ledger.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-serif text-xl font-semibold text-stone-900">Skill Meters</h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  {weakestSkill
                    ? `Priority focus: ${weakestSkill.label} (${weakestSkill.score}%)`
                    : 'Updated automatically from your evaluated speaking, writing, and review sessions.'}
                </p>
              </div>
              <Link href="/labs" className="text-xs font-semibold text-indigo-700 hover:underline">
                Open Labs →
              </Link>
            </div>

            <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
              {skillEntries.map(({ key, label, href, cta, icon: Icon, score }) => {
                const isPriority = weakestSkill?.key === key && score < 85;
                return (
                  <Link
                    key={key}
                    href={href}
                    className={`group rounded-xl border p-3.5 transition hover:border-indigo-300 ${
                      isPriority ? 'border-amber-200 bg-amber-50/30' : 'border-stone-100 bg-stone-50/80'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-stone-800">
                        <Icon className="h-3.5 w-3.5 text-indigo-600" />
                        <span>{label}</span>
                        {isPriority && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                            Focus
                          </span>
                        )}
                      </span>
                      <span className="font-mono font-semibold text-indigo-700">{score}%</span>
                    </div>
                    <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white ring-1 ring-stone-200/70">
                      <div
                        className={`h-full rounded-full ${isPriority ? 'bg-amber-500' : 'bg-gradient-to-r from-indigo-600 to-indigo-700'}`}
                        style={{ width: `${Math.min(100, Math.max(3, score))}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] font-semibold text-indigo-700 opacity-80 group-hover:opacity-100">
                      {cta} →
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
            <h2 className="font-serif text-xl font-semibold text-stone-900">Recent Study Log</h2>
            {recentXp.length > 0 ? (
              <ul className="mt-4 divide-y divide-stone-100">
                {recentXp.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-stone-800">
                        {event.note || event.source.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-stone-500">
                        {new Date(event.created_at).toLocaleDateString()} · {event.source.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                      +{event.points} XP
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-stone-500">
                Complete an AI speaking or writing evaluation or FSRS drill to log study sessions.
              </p>
            )}
          </section>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <WeeklyPaceSelector currentHours={weeklyGoalHours} />

          <WeeklyReportCard report={weeklyReport} />

          <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-stone-900">Milestones &amp; Quick Tools</h2>
              <Award className="h-4 w-4 text-emerald-700" />
            </div>
            {badges.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {badges.map((badge) => (
                  <li
                    key={badge.code}
                    className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 px-3.5 py-2.5 text-sm"
                  >
                    <span className="font-semibold text-stone-900">{badge.title}</span>
                    <span className="text-xs text-emerald-700">
                      {new Date(badge.earned_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs leading-5 text-stone-500">
                Milestones unlock automatically as you record 2-minute monologues, revise writing drafts, and clear FSRS cards.
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-stone-100 pt-4">
              <Link
                href="/labs"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100"
              >
                <Mic className="h-3.5 w-3.5 text-indigo-700" />
                <span>AI Labs</span>
              </Link>
              <Link
                href="/portfolio"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100"
              >
                <Award className="h-3.5 w-3.5 text-indigo-700" />
                <span>Portfolio</span>
              </Link>
              <Link
                href="/onboarding/placement"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100"
              >
                <Compass className="h-3.5 w-3.5 text-indigo-700" />
                <span>Placement</span>
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-stone-600" />
                <h2 className="font-serif text-base font-semibold text-stone-900">Account &amp; Privacy</h2>
              </div>
              <Link href="/privacy" className="text-xs font-semibold text-indigo-700 hover:underline">
                Manage data →
              </Link>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Export or erase learning records and recordings, or review retention controls.
            </p>

            {obs && obs.total_requests > 0 && (
              <details className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-600">
                <summary className="cursor-pointer font-semibold text-stone-700 hover:text-stone-900">
                  AI telemetry (last 7d · {obs.total_requests} requests)
                </summary>
                <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-stone-50 p-2">
                    <p className="text-[10px] font-bold uppercase text-stone-500">Cache hit</p>
                    <p className="mt-0.5 font-mono font-bold text-emerald-700">{obs.cache_hit_rate}%</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-2">
                    <p className="text-[10px] font-bold uppercase text-stone-500">Avg latency</p>
                    <p className="mt-0.5 font-mono font-bold text-stone-900">{obs.avg_latency_ms}ms</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-2">
                    <p className="text-[10px] font-bold uppercase text-stone-500">Failures</p>
                    <p className="mt-0.5 font-mono font-bold text-stone-900">{obs.failure_count}</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-2">
                    <p className="text-[10px] font-bold uppercase text-stone-500">Est. cost</p>
                    <p className="mt-0.5 font-mono font-bold text-indigo-700">${obs.total_cost_usd.toFixed(4)}</p>
                  </div>
                </div>
              </details>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
