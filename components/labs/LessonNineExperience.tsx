'use client';

import Link from 'next/link';
import type { CurriculumLesson, CurriculumModule } from '@/lib/curriculum';
import WritingLab from '@/components/labs/WritingLab';
import type { LessonLabContext } from '@/components/labs/LessonLabContext';

export default function LessonNineExperience({ module, lesson }: { module: CurriculumModule; lesson: CurriculumLesson }) {
  const prompt = "Write 2–3 sentences comparing a daily habit with something you're doing differently this week.";
  const labContext: LessonLabContext = {
    moduleId: module.module_number,
    lessonId: lesson.lesson_number,
    prompt,
    targetGrammar: ['Present simple vs. present continuous'],
    targetVocabulary: [],
    cefrSkill: 'Writing',
    mode: 'drill',
    minWords: 1,
    maxWords: 1500,
    onComplete: async ({ score }) => {
      await fetch('/api/curriculum/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleNumber: module.module_number, lessonNumber: lesson.lesson_number, completed: true, score }),
      });
    },
  };

  const previousHref = lesson.lesson_number > 1
    ? `/curriculum/modules/${module.module_number}/lessons/${lesson.lesson_number - 1}`
    : '/curriculum';
  const nextHref = lesson.lesson_number < 32
    ? `/curriculum/modules/${module.module_number}/lessons/${lesson.lesson_number + 1}`
    : '/curriculum';

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:py-10">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Link href="/curriculum" className="font-semibold text-indigo-700 hover:underline">← All modules</Link>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <p className="text-slate-500">Module {module.module_number} · Lesson {lesson.lesson_number}/32 · {lesson.duration_minutes} min</p>
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">Present Simple or Continuous?</h1>
      </header>

      <section aria-labelledby="writing-lab-title" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="writing-lab-title" className="text-lg font-bold text-slate-900">Focused writing practice</h2>
            <p className="mt-1 text-sm text-slate-600">Use the present simple for habits and the present continuous for temporary changes.</p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">Present simple vs. continuous</span>
        </div>

        <details className="mb-4 rounded-lg border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600">Module targets</summary>
          <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
            <div><p className="font-semibold text-slate-700">Grammar</p><ul className="mt-1 list-disc pl-4 text-slate-500">{module.target_grammar.map((target) => <li key={target}>{target}</li>)}</ul></div>
            <div><p className="font-semibold text-slate-700">Vocabulary</p><ul className="mt-1 list-disc pl-4 text-slate-500">{module.target_vocabulary.map((target) => <li key={target}>{target}</li>)}</ul></div>
          </div>
        </details>

        <WritingLab lessonContext={labContext} />
        <p className="mt-3 text-right text-xs text-slate-400">Want to practise freely? <Link href="/labs" className="font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-indigo-700">Open the /labs sandbox</Link>.</p>
      </section>

      <nav aria-label="Lesson navigation" className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
        <Link href={previousHref} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white">← Lesson {lesson.lesson_number - 1}</Link>
        <Link href={nextHref} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Next lesson →</Link>
      </nav>
    </main>
  );
}
