import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Flag,
  Mic,
  PenLine,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import WeekDetailPanel from '@/components/curriculum/WeekDetailPanel';
import { loadDetailedContent } from '@/lib/curriculum/details';
import {
  checkpointAfterWeek,
  getStage,
  getWeek,
  levelForWeek,
  loadSyllabusContent,
  phaseForWeek,
  skillLevelsForWeek,
  syllabus,
} from '@/lib/curriculum/syllabus';

type PageProps = { params: Promise<{ week: string }> };

export function generateStaticParams() {
  return syllabus.weeks.map((week) => ({ week: String(week.number) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { week: weekParam } = await params;
  const week = getWeek(Number(weekParam));
  if (!week) return { title: 'Week not found · Fluency Studio' };
  return {
    title: `Week ${week.number}: ${week.theme} · B1 → B2 | Fluency Studio`,
    description: `${week.mainGrammar}. ${week.secondaryGrammar ?? ''}`.trim(),
  };
}

const TASK_ICONS: Record<string, typeof BookOpen> = {
  vocabulary: BookOpen,
  grammar: Sparkles,
  listening: Mic,
  reading: BookOpen,
  speaking: Mic,
  conversation: Sparkles,
  writing: PenLine,
  review: RotateCcw,
  'extra-input': BookOpen,
};

export default async function WeekPage({ params }: PageProps) {
  const { week: weekParam } = await params;
  const weekNumber = Number(weekParam);
  if (!Number.isInteger(weekNumber)) notFound();

  const [{ weeks, source }, detailed] = await Promise.all([
    loadSyllabusContent(),
    loadDetailedContent(),
  ]);
  const week = weeks.find((item) => item.number === weekNumber) ?? getWeek(weekNumber);
  if (!week) notFound();

  const weekDetail = detailed.weeks.find((item) => item.number === weekNumber);
  const stage = getStage(week.stage);
  const phase = phaseForWeek(weekNumber);
  const skills = skillLevelsForWeek(weekNumber);
  const checkpoint = checkpointAfterWeek(weekNumber);
  const previousWeek = weeks.find((item) => item.number === weekNumber - 1);
  const nextWeek = weeks.find((item) => item.number === weekNumber + 1);

  return (
    <main className="mx-auto max-w-5xl space-y-7 px-4 py-8 sm:px-6 sm:py-12">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <Link href="/curriculum" className="hover:text-indigo-700 hover:underline">
          Curriculum
        </Link>
        <span aria-hidden>/</span>
        <Link href="/curriculum#weeks" className="hover:text-indigo-700 hover:underline">
          {stage?.title ?? `Stage ${week.stage}`}
        </Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-stone-700">Week {week.number}</span>
      </nav>

      <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_12px_32px_-16px_rgba(24,24,27,0.08)] sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
          <span className="rounded-full bg-indigo-700 px-2.5 py-1 text-white">WEEK {String(week.number).padStart(2, '0')} / 32</span>
          <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-stone-700">
            Stage {week.stage} · phase {week.phase}
          </span>
          {syllabus.stages[week.stage - 1] && (
            <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-stone-600">
              {syllabus.stages[week.stage - 1].hours}h stage
            </span>
          )}
          <span className="ml-auto text-[10px] uppercase tracking-wider text-stone-400">
            {source === 'supabase' ? 'Synced from Supabase' : 'Bundled syllabus'}
          </span>
        </div>
        <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight tracking-tight text-stone-900 sm:text-4xl">
          {week.theme}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          {phase?.focus ?? stage?.aim} {stage?.grammar}
        </p>
        {week.skillsFocus && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs font-semibold text-emerald-900">
            <Flag className="h-3.5 w-3.5" />
            Skills focus: {week.skillsFocus}
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link
            href="/labs"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800"
          >
            <Mic className="h-4 w-4" />
            Practise this week in the Labs
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/review"
            className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
          >
            <RotateCcw className="h-4 w-4 text-amber-700" />
            Review queue
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">Main grammar</p>
          <h2 className="mt-2 font-serif text-xl font-semibold leading-snug text-stone-900">{week.mainGrammar}</h2>
          <p className="mt-2 text-xs leading-6 text-stone-600">
            One grammar point at a time: study the model, do the guided practice, then use it in your own speaking and writing.
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">Also this week</p>
          <h2 className="mt-2 font-serif text-xl font-semibold leading-snug text-stone-900">
            {week.secondaryGrammar ?? 'Personal review of your hardest grammar'}
          </h2>
          <p className="mt-2 text-xs leading-6 text-stone-600">
            {week.secondaryGrammar ? week.secondaryGrammarLabel : 'Personal review week: the grammar you personally find hardest.'}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold text-stone-900">Your targets this week</h2>
          <Link href="/curriculum#ladders" className="text-xs font-semibold text-indigo-700 hover:underline">
            See the full skill ladders →
          </Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {syllabus.skillLadders.map((ladder) => (
            <div key={ladder.key} className="rounded-xl border border-stone-200 bg-white p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{ladder.label}</p>
                <span className="font-mono text-[10px] text-stone-400">wk {levelForWeek(ladder, weekNumber)?.weeks}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-stone-900">{skills[ladder.key]}</p>
            </div>
          ))}
        </div>
      </section>

      {weekDetail && (
        <WeekDetailPanel
          detail={weekDetail}
          checkpointFocus={checkpoint?.number === 1 ? weekDetail.checkpoint1.focus : undefined}
        />
      )}

      <section className="space-y-3">
        <h2 className="font-serif text-xl font-semibold text-stone-900">The weekly task list</h2>
        <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {syllabus.weeklyTasks.map((task) => {
            const Icon = TASK_ICONS[task.key] ?? BookOpen;
            return (
              <Link
                key={task.key}
                href={task.href}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-stone-50/80"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100 text-indigo-700">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-[220px] flex-1 text-xs font-semibold text-stone-800">{task.title}</span>
                <span className="text-[11px] text-stone-500">{task.time}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    task.requirementKind === 'required'
                      ? 'bg-indigo-100 text-indigo-800'
                      : task.requirementKind === 'recommended'
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {task.requirement}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
              </Link>
            );
          })}
        </div>
        <p className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs leading-6 text-stone-700">
          <CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5 text-indigo-700" />
          {syllabus.progression.rule} {syllabus.progression.target}
        </p>
      </section>

      {checkpoint && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-emerald-800" />
            <h2 className="font-serif text-lg font-semibold text-emerald-950">
              Checkpoint {checkpoint.number} follows this week
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-emerald-900">{checkpoint.assessed}</p>
          <p className="mt-2 text-xs leading-5 text-emerald-800">{syllabus.marking}</p>
        </section>
      )}

      <nav aria-label="Week navigation" className="grid gap-3 sm:grid-cols-2">
        {previousWeek ? (
          <Link
            href={`/curriculum/weeks/${previousWeek.number}`}
            className="group rounded-xl border border-stone-200 bg-white p-4 transition hover:border-indigo-300"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
              <ArrowLeft className="h-3.5 w-3.5" /> Previous week
            </p>
            <p className="mt-1 font-serif text-base font-semibold text-stone-900 group-hover:text-indigo-800">
              Week {previousWeek.number} · {previousWeek.theme}
            </p>
          </Link>
        ) : (
          <div className="rounded-xl border border-dashed border-stone-200 p-4 text-xs text-stone-400">Start of Stage 1</div>
        )}
        {nextWeek ? (
          <Link
            href={`/curriculum/weeks/${nextWeek.number}`}
            className="group rounded-xl border border-stone-200 bg-white p-4 text-right transition hover:border-indigo-300"
          >
            <p className="flex items-center justify-end gap-1.5 text-[11px] font-semibold text-stone-500">
              Next week <ArrowRight className="h-3.5 w-3.5" />
            </p>
            <p className="mt-1 font-serif text-base font-semibold text-stone-900 group-hover:text-indigo-800">
              Week {nextWeek.number} · {nextWeek.theme}
            </p>
          </Link>
        ) : (
          <div className="rounded-xl border border-dashed border-stone-200 p-4 text-right text-xs text-stone-400">
            End of Stage 2 · EF SET again
          </div>
        )}
      </nav>
    </main>
  );
}
