import Link from 'next/link';
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  Headphones,
  Layers,
  Mic,
  PenLine,
  Sparkles,
} from 'lucide-react';
import { getViewer, loadOutline } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

const DAILY_FLOW_FALLBACK = [
  { block: 'warm_up', minutes: 3, label: 'Warm-up', description: 'Recall 5–10 spaced-repetition vocabulary cards.' },
  { block: 'input', minutes: 8, label: 'Input', description: 'Short grammar explanation, reading article or listening audio.' },
  { block: 'practice', minutes: 10, label: 'Practice', description: 'Interactive exercises on target grammar and vocabulary.' },
  { block: 'output', minutes: 10, label: 'Output', description: 'Guided voice recording, writing draft or role-play.' },
  { block: 'feedback', minutes: 4, label: 'Feedback', description: 'Corrections, alternative phrasing and rubric review.' },
];

const SKILL_HOURS_FALLBACK = [
  { skill: 'Listening', hours: 12 },
  { skill: 'Speaking', hours: 12 },
  { skill: 'Grammar', hours: 10 },
  { skill: 'Reading', hours: 10 },
  { skill: 'Writing', hours: 10 },
  { skill: 'Vocabulary', hours: 8 },
  { skill: 'Checkpoints', hours: 2 },
];

const MODULE_ACCENTS = [
  'from-indigo-600 to-indigo-400',
  'from-sky-600 to-cyan-400',
  'from-emerald-600 to-teal-400',
  'from-amber-500 to-orange-400',
  'from-rose-600 to-pink-400',
  'from-violet-600 to-purple-400',
  'from-blue-600 to-indigo-400',
  'from-teal-600 to-emerald-400',
];

const BLOCK_ICONS: Record<string, typeof Layers> = {
  warm_up: Layers,
  input: Headphones,
  practice: CheckCircle2,
  output: Mic,
  feedback: Sparkles,
};

export default async function Home() {
  const [outline, viewer] = await Promise.all([loadOutline(), getViewer()]);
  const course = outline?.course ?? null;
  const modules = outline?.modules ?? [];
  const checkpoints = outline?.checkpoints ?? [];
  const dailyFlow = course?.daily_flow?.length ? course.daily_flow : DAILY_FLOW_FALLBACK;
  const skillBalance = course?.skill_balance?.length
    ? course.skill_balance.map((item) => ({
        skill: item.skill.charAt(0).toUpperCase() + item.skill.slice(1),
        hours: item.hours,
      }))
    : SKILL_HOURS_FALLBACK;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Editorial Hero Split */}
      <section className="grid gap-10 lg:grid-cols-12 lg:items-start">
        <div className="space-y-6 lg:col-span-7">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-stone-200/90 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>CEFR B1 → B2 · Independent User</span>
            <span aria-hidden className="text-stone-300">·</span>
            <span className="text-indigo-700">{course?.total_hours ?? 64} guided hours</span>
          </div>

          <h1 className="font-serif text-4xl font-semibold leading-[1.08] tracking-tight text-stone-900 sm:text-5xl lg:text-[3.25rem]">
            A calm, structured atelier to reach{' '}
            <span className="italic text-indigo-700">solid B2 English.</span>
          </h1>

          <p className="max-w-2xl text-[15px] leading-7 text-stone-600 sm:text-base">
            {course?.description ??
              'Eight themed modules of eight lessons each (64 lessons total) built around active recall, multi-accent listening, spoken & written output, and targeted AI coaching.'}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href={viewer.signedIn ? '/dashboard' : '/curriculum'}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-950/15 transition hover:-translate-y-0.5 hover:bg-indigo-800"
            >
              <span>{viewer.signedIn ? 'Open Study Dashboard' : 'Explore 64-Lesson Curriculum'}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/labs"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-800 shadow-2xs transition hover:border-stone-400 hover:bg-stone-50"
            >
              <Mic className="h-4 w-4 text-indigo-700" />
              <span>Speaking &amp; Writing Labs</span>
            </Link>
            {!viewer.signedIn && (
              <Link
                href="/onboarding/placement"
                className="inline-flex items-center gap-1.5 px-2.5 py-3 text-sm font-semibold text-indigo-700 hover:underline"
              >
                <Compass className="h-4 w-4" />
                <span>3-min placement check</span>
              </Link>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-4 border-t border-stone-200/80 pt-6 sm:grid-cols-4">
            <div className="rounded-xl border border-stone-200/70 bg-white/80 p-3.5">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                <Clock className="h-3.5 w-3.5 text-indigo-600" />
                <span>Length</span>
              </dt>
              <dd className="mt-1.5 font-serif text-2xl font-semibold text-stone-900">
                {course?.total_hours ?? 64}h
              </dd>
            </div>
            <div className="rounded-xl border border-stone-200/70 bg-white/80 p-3.5">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
                <span>Structure</span>
              </dt>
              <dd className="mt-1.5 font-serif text-2xl font-semibold text-stone-900">8 × 8</dd>
            </div>
            <div className="rounded-xl border border-stone-200/70 bg-white/80 p-3.5">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                <PenLine className="h-3.5 w-3.5 text-indigo-600" />
                <span>Daily pace</span>
              </dt>
              <dd className="mt-1.5 font-serif text-2xl font-semibold text-stone-900">
                {course?.daily_minutes_min ?? 20}–{course?.daily_minutes_max ?? 45}m
              </dd>
            </div>
            <div className="rounded-xl border border-stone-200/70 bg-white/80 p-3.5">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                <Award className="h-3.5 w-3.5 text-indigo-600" />
                <span>Checkpoints</span>
              </dt>
              <dd className="mt-1.5 font-serif text-2xl font-semibold text-stone-900">M2·4·6·8</dd>
            </div>
          </dl>
        </div>

        {/* Right Architectural Panel */}
        <aside className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_12px_32px_-16px_rgba(24,24,27,0.08)] lg:col-span-5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Daily Study Loop</p>
              <h2 className="mt-0.5 font-serif text-xl font-semibold text-stone-900">
                5-Block Lesson Architecture
              </h2>
            </div>
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
              ~35–45 min
            </span>
          </div>

          <ol className="mt-4 space-y-2.5">
            {dailyFlow.map((step, idx) => {
              const Icon = BLOCK_ICONS[step.block] ?? BookOpen;
              return (
                <li
                  key={step.block}
                  className="flex items-start gap-3 rounded-xl border border-stone-100 bg-stone-50/80 p-3 transition hover:border-indigo-200/80 hover:bg-indigo-50/30"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-700 shadow-2xs ring-1 ring-stone-200/80">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-stone-900">
                        {idx + 1}. {step.label}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-stone-500 ring-1 ring-stone-200/70">
                        {step.minutes} min
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs leading-5 text-stone-600">{step.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-5 border-t border-stone-100 pt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">64-Hour Skill Balance</p>
            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {skillBalance.map((item) => (
                <div key={item.skill} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-stone-700">{item.skill}</span>
                    <span className="font-semibold text-stone-900">{item.hours}h</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-indigo-600"
                      style={{ width: `${Math.min(100, Math.round((item.hours / 12) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {/* 8-Module Roadmap */}
      {modules.length > 0 && (
        <section className="mt-16 border-t border-stone-200/80 pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Syllabus</p>
              <h2 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-stone-900">
                Eight Modules from B1 to B2
              </h2>
            </div>
            <Link
              href="/curriculum"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline"
            >
              <span>Explore all 64 lessons</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((mod, idx) => (
              <Link
                key={mod.id}
                href={`/curriculum/lessons/${mod.lesson_start}`}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
              >
                <span
                  aria-hidden
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${MODULE_ACCENTS[idx % MODULE_ACCENTS.length]}`}
                />
                <div className="pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-indigo-700">
                      Module {String(mod.number).padStart(2, '0')}
                    </span>
                    <span className="text-stone-500">
                      L{mod.lesson_start}–{mod.lesson_end} · {mod.hours}h
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-stone-900 transition group-hover:text-indigo-700">
                    {mod.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-stone-600">{mod.summary}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-stone-100 pt-3">
                  {mod.grammar.slice(0, 2).map((g) => (
                    <span key={g} className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                      {g}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Checkpoints */}
      {checkpoints.length > 0 && (
        <section className="mt-12 rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Progress Gates</p>
              <h2 className="mt-0.5 font-serif text-2xl font-semibold text-stone-900">
                Four Assessment Checkpoints
              </h2>
            </div>
            <Link
              href="/checkpoints"
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"
            >
              <span>Open checkpoint runner</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {checkpoints.map((cp) => (
              <Link
                key={cp.code}
                href={`/checkpoints/${cp.code}`}
                className="group rounded-xl border border-stone-200/80 bg-stone-50/70 p-4 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-700">{cp.timing}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-700" />
                </div>
                <p className="mt-1.5 text-sm font-bold text-stone-900">{cp.title}</p>
                <p className="mt-1 text-xs leading-5 text-stone-600">{cp.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
