'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Stethoscope, XCircle } from 'lucide-react';
import type { ClinicTopic } from '@/lib/b1b2/grammar-clinic';

export default function GrammarClinicClient({
  topics,
  recommendedSlugs,
  initialSlug,
}: {
  topics: ClinicTopic[];
  recommendedSlugs: string[];
  initialSlug?: string | null;
}) {
  const recommendedSet = new Set(recommendedSlugs);
  const defaultSlug =
    (initialSlug && topics.some((t) => t.slug === initialSlug) ? initialSlug : null) ??
    recommendedSlugs[0] ??
    topics[0]?.slug ??
    '';

  const [activeSlug, setActiveSlug] = useState(defaultSlug);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const activeTopic = topics.find((t) => t.slug === activeSlug) ?? topics[0];

  if (!activeTopic) return null;

  const correctCount = activeTopic.items.filter((item) => answers[item.id] === item.answer).length;
  const answeredCount = activeTopic.items.filter((item) => checked[item.id]).length;

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
      <aside className="space-y-2.5 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs lg:col-span-4">
        <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
          <Stethoscope className="h-4 w-4 text-indigo-700" />
          <h2 className="font-serif text-base font-semibold text-stone-900">
            {topics.length} B1 Baseline Clinics
          </h2>
        </div>

        <nav aria-label="Grammar Clinic topics" className="space-y-1.5">
          {topics.map((topic) => {
            const isActive = topic.slug === activeTopic.slug;
            const isRecommended = recommendedSet.has(topic.slug);
            return (
              <button
                key={topic.slug}
                type="button"
                onClick={() => setActiveSlug(topic.slug)}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition ${
                  isActive
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950'
                    : 'border-stone-200/80 bg-stone-50/50 text-stone-800 hover:border-indigo-300 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{topic.title}</span>
                  {isRecommended && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                      Error log
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-stone-600">{topic.summary}</p>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-stone-100 pt-3 text-xs text-stone-600">
          <p className="leading-5">
            These B1 basics live here from Week 1 so the 16-week syllabus can stay focused on B1→B2 fluency.
          </p>
          <Link href="/review" className="mt-2 inline-block font-semibold text-indigo-700 hover:underline">
            Open personal error-review queue →
          </Link>
        </div>
      </aside>

      <section className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs lg:col-span-8">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
              Grammar Clinic
            </span>
            {recommendedSet.has(activeTopic.slug) && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                Matched to your error log
              </span>
            )}
          </div>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-stone-900">{activeTopic.title}</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">{activeTopic.summary}</p>
        </div>

        <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">Core B1 control rules</h3>
          <ul className="mt-2.5 space-y-1.5 text-sm text-stone-800">
            {activeTopic.coreRules.map((rule) => (
              <li key={rule} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">Typical slip vs. clean correction</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {activeTopic.contrastExamples.map((ex, idx) => (
              <div key={idx} className="rounded-xl border border-stone-200 bg-white p-3.5 text-xs">
                <p className="text-rose-700 line-through">{ex.weak}</p>
                <p className="mt-1 font-semibold text-emerald-800">{ex.strong}</p>
                <p className="mt-1.5 text-stone-600">{ex.why}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t border-stone-100 pt-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-lg font-semibold text-stone-900">Quick Diagnostic Drill</h3>
            <span className="text-xs font-semibold text-stone-600">
              {answeredCount > 0 ? `${correctCount}/${activeTopic.items.length} correct` : `${activeTopic.items.length} items`}
            </span>
          </div>

          <div className="space-y-3">
            {activeTopic.items.map((item, idx) => {
              const selected = answers[item.id];
              const isChecked = Boolean(checked[item.id]);
              const isCorrect = selected === item.answer;

              return (
                <div key={item.id} className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                  <p className="text-sm font-medium text-stone-900">
                    {idx + 1}. {item.prompt}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.options.map((option) => {
                      const active = selected === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            setAnswers((prev) => ({ ...prev, [item.id]: option }));
                            setChecked((prev) => ({ ...prev, [item.id]: true }));
                          }}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                            isChecked && option === item.answer
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                              : isChecked && active && !isCorrect
                                ? 'border-rose-400 bg-rose-50 text-rose-800'
                                : active
                                  ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                                  : 'border-stone-300 bg-white text-stone-700 hover:border-indigo-300'
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  {isChecked && (
                    <div
                      className={`mt-3 flex items-start gap-2 rounded-lg p-2.5 text-xs ${
                        isCorrect ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-950'
                      }`}
                    >
                      {isCorrect ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                      )}
                      <span>
                        <strong>{isCorrect ? 'Correct:' : `Answer: ${item.answer} —`}</strong> {item.explanation}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
