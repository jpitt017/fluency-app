'use client';

import Link from 'next/link';
import { b1Curriculum, curriculumStages } from '@/lib/curriculum';

export default function CurriculumPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">CEFR B1 · 64 hours</p>
        <h1 class="text-3xl font-bold text-slate-950">Fluency Curriculum</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Eight repeatable modules, each with 32 micro-lessons and a final can-do checkpoint.
        </p>
      </header>

      <div className="grid gap-6">
        {b1Curriculum.modules.map((module) => (
          <section key={module.module_number} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Module {module.module_number} · 8 hours</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{module.title}</h2>
              </div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">32 micro-lessons</span>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Target grammar</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {module.target_grammar.map((item) => <li key={item} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{item}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Target vocabulary</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {module.target_vocabulary.map((item) => <li key={item} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800">{item}</li>)}
                </ul>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {curriculumStages.map((stage, stageIndex) => {
                const lessons = module.lessons.filter((lesson) => lesson.stage === stage);
                return (
                  <Link
                    key={stage}
                    href={`/lessons/placeholder-session?module=${module.module_number}&stage=${stageIndex + 1}`}
                    className="rounded-xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:shadow-sm"
                  >
                    <p class="text-xs font-bold text-indigo-600">Hours {stageIndex * 2 + 1}–{stageIndex * 2 + 2}</p>
                    <h3 className="mt-1 font-semibold text-slate-900">{stage}</h3>
                    <p className="mt-2 text-xs text-slate-500">Lessons {lessons[0]?.lesson_number}–{lessons.at(-1)?.lesson_number}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
