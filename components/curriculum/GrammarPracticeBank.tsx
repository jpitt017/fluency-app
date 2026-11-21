'use client';

import { useState } from 'react';
import { Eye, EyeOff, Filter } from 'lucide-react';
import type { GrammarPractice, GrammarItem } from '@/lib/curriculum/details';

function answer(key: GrammarItem['key'], accepted: GrammarItem['accepted']): string {
  if (Array.isArray(key)) {
    return key
      .map((part, index) => {
        const variants = Array.isArray(accepted) && Array.isArray(accepted[index]) ? accepted[index] : [];
        return `${part}${variants.length ? ` (${variants.join(', ')})` : ''}`;
      })
      .join(' ... ');
  }
  const variants = Array.isArray(accepted) ? accepted : [];
  return `${key}${variants.length ? ` (${variants.join(', ')})` : ''}`;
}

export default function GrammarPracticeBank({ practice }: { practice: GrammarPractice }) {
  const [step, setStep] = useState('All');
  const [showAnswers, setShowAnswers] = useState(false);
  const steps = ['All', ...new Set(practice.items.map((item) => item.step))];
  const visible = step === 'All' ? practice.items : practice.items.filter((item) => item.step === step);

  return (
    <section className="space-y-3" aria-label="Full grammar practice item bank">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">Full practice set · pilot draft</p>
          <h3 className="font-serif text-lg font-semibold text-stone-900">
            {practice.items.length} items · {practice.durationMinutes} minutes
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setShowAnswers((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-800 transition hover:border-indigo-300"
        >
          {showAnswers ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showAnswers ? 'Hide keys' : 'Reveal keys'}
        </button>
      </div>

      <details className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs">
        <summary className="cursor-pointer font-semibold text-stone-800">Notice text and the nine-step structure</summary>
        <blockquote className="mt-3 rounded-lg bg-stone-50 p-3 leading-6 text-stone-700">{practice.notice.text}</blockquote>
        <p className="mt-2 text-[11px] text-stone-500">Step 1: learners tap the {practice.notice.targetForms} bold forms · {practice.notice.markedBy}.</p>
        <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {practice.steps.map((entry) => (
            <li key={entry.step} className="flex items-baseline gap-2 leading-5 text-stone-600">
              <span className="font-mono text-[10px] font-bold text-indigo-700">{String(entry.step).padStart(2, '0')}</span>
              <span>{entry.exercise}</span>
              <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-stone-400">
                {entry.time} · {typeof entry.items === 'number' ? `${entry.items} items` : entry.items}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 border-t border-stone-100 pt-2 leading-5 text-stone-600">{practice.extraPractice}</p>
        <p className="mt-1 leading-5 text-stone-600">{practice.feedback}</p>
        {practice.week1Review && <p className="mt-1 leading-5 text-stone-600">{practice.week1Review}</p>}
      </details>

      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 text-stone-400" />
        {steps.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setStep(option)}
            aria-pressed={step === option}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
              step === option
                ? 'border-indigo-700 bg-indigo-700 text-white'
                : 'border-stone-300 bg-white text-stone-700 hover:border-indigo-300'
            }`}
          >
            {option}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-stone-500">Showing {visible.length} of {practice.items.length}</span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {visible.map((item) => (
          <article key={item.id} className="rounded-xl border border-stone-200 bg-white p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] font-bold text-indigo-700">{item.id}</span>
              <span className="text-[10px] text-stone-500">{item.step} · {item.target}</span>
            </div>
            <p className="mt-1.5 text-xs font-semibold leading-5 text-stone-800">{item.prompt}</p>
            {item.options.length > 0 && (
              <p className="mt-1 font-mono text-[11px] leading-5 text-stone-500">{item.options.join(' / ')}</p>
            )}
            {showAnswers && (
              <p className="mt-2 space-y-1 text-[11px] leading-5">
                <span className="block text-emerald-800"><strong className="font-semibold">Key:</strong> {answer(item.key, item.accepted)}</span>
                <span className="block text-stone-600">{item.reason}</span>
              </p>
            )}
          </article>
        ))}
      </div>
      <p className="text-[10px] leading-5 text-stone-500">{practice.itemFormat} Pilot draft — awaiting the second-teacher review checklist.</p>
    </section>
  );
}
