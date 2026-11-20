import Link from 'next/link';
import { notFound } from 'next/navigation';
import LessonRunner from '@/components/b1b2/LessonRunner';
import { getViewer, loadLesson } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

const SKILL_LABEL: Record<string, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  listening: 'Listening',
  reading: 'Reading',
  speaking: 'Speaking',
  writing: 'Writing',
  review: 'Review',
};

const BLOCK_LABEL: Record<string, string> = {
  warm_up: 'Warm-up',
  input: 'Input',
  practice: 'Practice',
  output: 'Output',
  feedback: 'Feedback',
};

const REQ_BADGE: Record<string, { label: string; style: string }> = {
  required: { label: 'Required output', style: 'bg-rose-100 text-rose-800' },
  either_wed_thu: { label: 'Wed or Thu required (≥12/16 wks)', style: 'bg-sky-100 text-sky-800' },
  optional: { label: 'Optional reinforcement', style: 'bg-stone-100 text-stone-600' },
};

function parseLessonNumber(value: string) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 112 ? number : null;
}

export async function generateMetadata({ params }: { params: Promise<{ lessonNumber: string }> }) {
  const { lessonNumber } = await params;
  const number = parseLessonNumber(lessonNumber);
  if (!number) return { title: 'Session not found' };

  const payload = await loadLesson(number);
  if (!payload) return { title: 'Session not found' };

  return {
    title: `Session ${number}: ${payload.lesson.title} · Fluency Studio`,
    description: payload.lesson.can_do,
  };
}

export default async function LessonPage({ params }: { params: Promise<{ lessonNumber: string }> }) {
  const { lessonNumber } = await params;
  const number = parseLessonNumber(lessonNumber);
  if (!number) notFound();

  const [payload, viewer] = await Promise.all([loadLesson(number), getViewer()]);
  if (!payload) notFound();

  const { lesson, module, blocks, progress } = payload;
  const orderedBlocks = [...blocks].sort((a, b) => a.sort_order - b.sort_order);
  const status = progress?.status ?? 'not_started';
  const previous = lesson.lesson_number > 1 ? lesson.lesson_number - 1 : null;
  const next = lesson.lesson_number < 112 ? lesson.lesson_number + 1 : null;
  const weekNum = module.week_number ?? module.number;
  const reqMeta = REQ_BADGE[lesson.session_requirement ?? 'optional'] ?? REQ_BADGE.optional;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
        <Link href="/curriculum" className="font-semibold text-indigo-700 hover:underline">
          Curriculum
        </Link>
        <span aria-hidden>/</span>
        <span>
          Week {weekNum}: {module.title}
        </span>
        <span aria-hidden>/</span>
        <span className="font-medium text-stone-700">
          {lesson.day_of_week ? `${lesson.day_of_week} · ` : ''}Session {lesson.lesson_number}
        </span>
      </nav>

      {/* Split Editorial Workspace */}
      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="space-y-6 lg:col-span-8">
          <header className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full bg-indigo-700 px-2.5 py-1 text-white">
                Week {weekNum} · {lesson.day_of_week ?? `Day ${lesson.module_lesson_number}`}
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                {SKILL_LABEL[lesson.primary_skill] ?? lesson.primary_skill}
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">{lesson.duration_minutes} min</span>
              <span className={`rounded-full px-2.5 py-1 ${reqMeta.style}`}>{reqMeta.label}</span>
              <span
                className={`rounded-full px-2.5 py-1 ${
                  status === 'completed'
                    ? 'bg-emerald-100 text-emerald-800'
                    : status === 'in_progress'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-stone-100 text-stone-600'
                }`}
              >
                {status === 'completed' ? 'Complete' : status === 'in_progress' ? 'In progress' : 'Not started'}
              </span>
            </div>

            <h1 className="mt-3 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">{lesson.title}</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">{lesson.objective}</p>
            <div className="mt-4 rounded-xl border-l-4 border-indigo-500 bg-indigo-50/70 p-3.5 text-sm font-medium text-indigo-950">
              {lesson.can_do}
            </div>
          </header>

          <LessonRunner payload={payload} signedIn={viewer.signedIn} />

          <nav aria-label="Lesson navigation" className="flex items-center justify-between gap-3 border-t border-stone-200 pt-5">
            {previous ? (
              <Link
                href={`/curriculum/lessons/${previous}`}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100"
              >
                ← Session {previous}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/curriculum/lessons/${next}`}
                className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
              >
                {status === 'completed' ? 'Next session' : 'Skip ahead'} · Session {next} →
              </Link>
            ) : (
              <Link
                href="/curriculum"
                className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
              >
                Back to 16-week syllabus
              </Link>
            )}
          </nav>
        </div>

        {/* Sticky Companion Panel */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:col-span-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Session Plan</p>
            <h2 className="mt-1 text-base font-bold text-stone-900">5-Block Flow</h2>
            <ol className="mt-3 space-y-2">
              {orderedBlocks.map((block, index) => (
                <li key={block.id}>
                  <a
                    href={`#block-${block.block_kind}`}
                    className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-xs transition hover:border-indigo-300 hover:bg-indigo-50/40"
                  >
                    <span className="font-semibold text-stone-800">
                      {index + 1}. {BLOCK_LABEL[block.block_kind] ?? block.block_kind}
                    </span>
                    <span className="text-stone-500">~{block.minutes} min</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Week Context</p>
            <h3 className="mt-1 text-sm font-bold text-stone-900">
              Week {weekNum}: {module.title}
            </h3>
            {module.phase && <p className="mt-0.5 text-[11px] font-semibold text-indigo-700">{module.phase}</p>}
            <p className="mt-1 text-xs leading-5 text-stone-600">{module.summary}</p>
            {lesson.grammar_point && (
              <div className="mt-3 rounded-lg bg-stone-50 p-3 text-xs">
                <p>
                  <span className="font-semibold text-stone-700">Main grammar:</span>{' '}
                  <span className="text-stone-800">{lesson.grammar_point}</span>
                </p>
                {module.light_grammar && (
                  <p className="mt-1">
                    <span className="font-semibold text-stone-700">Light grammar:</span>{' '}
                    <span className="text-stone-800">{module.light_grammar}</span>
                  </p>
                )}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                {module.topic}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
              <Link href="/curriculum" className="text-xs font-semibold text-indigo-700 hover:underline">
                All 16 weeks →
              </Link>
              <Link href="/clinic" className="text-xs font-semibold text-stone-600 hover:text-indigo-700 hover:underline">
                Grammar Clinic →
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
