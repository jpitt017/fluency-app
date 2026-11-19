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

function parseLessonNumber(value: string) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 64 ? number : null;
}

export async function generateMetadata({ params }: { params: Promise<{ lessonNumber: string }> }) {
  const { lessonNumber } = await params;
  const number = parseLessonNumber(lessonNumber);
  if (!number) return { title: 'Lesson not found' };

  const payload = await loadLesson(number);
  if (!payload) return { title: 'Lesson not found' };

  return {
    title: `Lesson ${number}: ${payload.lesson.title}`,
    description: payload.lesson.can_do,
  };
}

export default async function LessonPage({ params }: { params: Promise<{ lessonNumber: string }> }) {
  const { lessonNumber } = await params;
  const number = parseLessonNumber(lessonNumber);
  if (!number) notFound();

  const [payload, viewer] = await Promise.all([loadLesson(number), getViewer()]);
  if (!payload) notFound();

  const { lesson, module, progress } = payload;
  const status = progress?.status ?? 'not_started';
  const previous = lesson.lesson_number > 1 ? lesson.lesson_number - 1 : null;
  const next = lesson.lesson_number < 64 ? lesson.lesson_number + 1 : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <Link href="/curriculum" className="font-semibold text-indigo-700 hover:underline">
          Curriculum
        </Link>
        <span aria-hidden>/</span>
        <span>Module {module.number} · {module.title}</span>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-indigo-600 px-2.5 py-1 text-white">Lesson {lesson.lesson_number}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{SKILL_LABEL[lesson.primary_skill] ?? lesson.primary_skill}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{lesson.duration_minutes} min</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{lesson.xp_reward} XP</span>
          <span
            className={`rounded-full px-2.5 py-1 ${
              status === 'completed' ? 'bg-emerald-100 text-emerald-800' : status === 'in_progress' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {status === 'completed' ? 'Complete' : status === 'in_progress' ? 'In progress' : 'Not started'}
          </span>
        </div>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{lesson.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{lesson.objective}</p>
        <p className="mt-3 rounded-xl border-l-4 border-indigo-400 bg-indigo-50/60 p-3 text-sm font-medium text-indigo-950">{lesson.can_do}</p>
        {lesson.grammar_point && (
          <p className="mt-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Grammar focus:</span> {lesson.grammar_point}
          </p>
        )}
      </header>

      <LessonRunner payload={payload} signedIn={viewer.signedIn} />

      <nav aria-label="Lesson navigation" className="mt-8 flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
        {previous ? (
          <Link href={`/curriculum/lessons/${previous}`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            ← Lesson {previous}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/curriculum/lessons/${next}`} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            {status === 'completed' ? 'Next lesson' : 'Skip ahead'} · Lesson {next} →
          </Link>
        ) : (
          <Link href="/curriculum" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Back to curriculum
          </Link>
        )}
      </nav>
    </main>
  );
}
