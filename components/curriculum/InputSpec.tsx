'use client';

import { useState } from 'react';
import { BookOpenText, Eye, EyeOff, Headphones } from 'lucide-react';
import type { InputSpec, InputWeek } from '@/lib/curriculum/details';

export default function InputSpec({
  mode,
  spec,
  content,
}: {
  mode: 'listening' | 'reading';
  spec: Omit<InputSpec, 'weeks'>;
  content: InputWeek;
}) {
  const [showAnswers, setShowAnswers] = useState(false);
  const [step, setStep] = useState('All');
  const Icon = mode === 'listening' ? Headphones : BookOpenText;
  const steps = ['All', ...new Set(content.questions.map((question) => question.step))];
  const visible = step === 'All' ? content.questions : content.questions.filter((question) => question.step === step);
  const stock = spec.extensive.stock.find((row) => row.week === content.week);

  return (
    <section className="space-y-3" aria-label={`Full ${mode} spec`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">
            {mode === 'listening' ? 'Listening' : 'Reading'} · pilot draft
          </p>
          <h3 className="font-serif text-lg font-semibold text-stone-900">
            <Icon className="mr-1.5 inline h-4 w-4 text-indigo-700" />
            {content.title}
          </h3>
        </div>
        <span className="text-[10px] text-stone-500">{content.speakers ?? content.description}</span>
      </div>

      <details className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs">
        <summary className="cursor-pointer font-semibold text-stone-800">Six-step, 15-minute task and extensive input</summary>
        <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {spec.steps.map((entry) => (
            <li key={entry.step} className="leading-5 text-stone-600">
              <strong className="font-semibold text-stone-800">{entry.step}.</strong> {entry.what}{' '}
              <span className="font-mono text-[10px] text-stone-400">{entry.time} · {entry.markedBy}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 border-t border-stone-100 pt-2 leading-5 text-stone-600">{spec.unlocking}</p>
        <p className="mt-1 leading-5 text-stone-600">{spec.support}</p>
        {spec.accents && <p className="mt-1 leading-5 text-stone-600">{spec.accents}</p>}
        <p className="mt-1 leading-5 text-stone-600">{spec.length}</p>
        {stock && (
          <p className="mt-2 rounded-lg bg-stone-50 p-2.5 leading-5 text-stone-600">
            <strong className="font-semibold text-stone-800">Extensive {mode}:</strong> {stock.themeTag} — {stock.whatToStock} ({stock.amount})
          </p>
        )}
      </details>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs">
        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Predict</p>
        <p className="mt-1 leading-6 text-stone-700">{content.predict}</p>
      </div>

      <details className="rounded-xl border border-stone-200 bg-white p-4">
        <summary className="cursor-pointer text-xs font-bold text-stone-900">
          {mode === 'listening' ? 'Full audio script' : 'Full reading text'}
        </summary>
        <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-line font-serif text-sm leading-7 text-stone-800">
          {mode === 'listening' ? content.script : content.text}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-1.5">
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
        <button
          type="button"
          onClick={() => setShowAnswers((value) => !value)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1 text-[10px] font-semibold text-stone-800 transition hover:border-indigo-300"
        >
          {showAnswers ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showAnswers ? 'Hide keys' : 'Reveal keys'}
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {visible.map((question) => (
          <article key={question.id} className="rounded-xl border border-stone-200 bg-white p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] font-bold text-indigo-700">{question.id}</span>
              <span className="text-[10px] text-stone-500">{question.step}</span>
            </div>
            <p className="mt-1.5 text-xs font-semibold leading-5 text-stone-800">{question.question}</p>
            {question.options.length > 0 && (
              <p className="mt-1 font-mono text-[11px] leading-5 text-stone-500">{question.options.join(' / ')}</p>
            )}
            {showAnswers && (
              <p className="mt-2 text-[11px] leading-5 text-emerald-800">
                <strong className="font-semibold">Key:</strong> {question.key}
              </p>
            )}
          </article>
        ))}
      </div>

      <p className="rounded-xl border border-stone-200 bg-white p-3.5 text-[11px] leading-5 text-stone-700">
        <strong className="font-semibold text-stone-900">Respond:</strong> {content.respond}
      </p>
      <p className="text-[10px] leading-5 text-stone-500">
        Sourced from the Weeks 1–4 {mode} brief · pilot draft pending a second-teacher review.
      </p>
    </section>
  );
}
