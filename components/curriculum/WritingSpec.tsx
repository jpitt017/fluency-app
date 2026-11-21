'use client';

import { useState } from 'react';
import { Eye, EyeOff, PenLine, Sparkles } from 'lucide-react';
import type { WritingDetail, WritingSpec as WritingSpecDoc } from '@/lib/curriculum/details';

export default function WritingSpec({ writing, spec }: { writing: WritingDetail; spec: WritingSpecDoc }) {
  const [showModel, setShowModel] = useState(false);

  return (
    <section className="space-y-3" aria-label="Full writing task spec">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">Writing · pilot draft</p>
          <h3 className="font-serif text-lg font-semibold text-stone-900">
            <PenLine className="mr-1.5 inline h-4 w-4 text-indigo-700" />
            {writing.title}
          </h3>
        </div>
        <span className="text-[10px] text-stone-500">
          {writing.durationMinutes} min · {writing.words[0]}–{writing.words[1]} words
        </span>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 text-xs leading-6 text-stone-700">
        <p className="font-semibold text-stone-900">{writing.prompt}</p>
        <p className="mt-2"><strong className="font-semibold text-stone-800">Reader and purpose:</strong> {writing.readerAndPurpose}</p>
        <p className="mt-2"><strong className="font-semibold text-stone-800">Grammar:</strong> {writing.grammar}</p>
        <p className="mt-1">
          <strong className="font-semibold text-stone-800">Featured words:</strong> {writing.featuredWords.join(', ')}
          {writing.stretchWords.length > 0 && <> (stretch: {writing.stretchWords.join(', ')})</>}
        </p>
        <p className="mt-1"><strong className="font-semibold text-stone-800">Linkers:</strong> {writing.linkers.join(', ')}</p>
        <p className="mt-1"><strong className="font-semibold text-stone-800">Paired reading:</strong> {writing.pairedReading}</p>
      </div>

      <details className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs">
        <summary className="cursor-pointer font-semibold text-stone-800">Five-step writing flow and learner support</summary>
        <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {spec.steps.map((step) => (
            <li key={step.step} className="leading-5 text-stone-600">
              <strong className="font-semibold text-stone-800">{step.step}. {step.name}.</strong> {step.what}{' '}
              {step.minutes !== null && <span className="font-mono text-[10px] text-stone-400">{step.minutes} min</span>}
            </li>
          ))}
        </ol>
        <p className="mt-3 border-t border-stone-100 pt-2 leading-5 text-stone-600">{spec.marking}</p>
        <p className="mt-1 leading-5 text-stone-600">{spec.unlocking}</p>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-stone-500">Review before launch</p>
        <ul className="mt-1 space-y-1 text-[11px] leading-5 text-stone-600">
          {spec.reviewChecklist.map((item) => <li key={item}>• {item}</li>)}
        </ul>
      </details>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-[11px] leading-5">
          <p className="text-xs font-bold text-stone-900">Required points checked by the AI</p>
          <ul className="mt-2 space-y-1 text-stone-700">
            {writing.requiredPoints.map((point) => <li key={point}>✓ {point}</li>)}
          </ul>
          <p className="mt-3 text-xs font-bold text-stone-900">Optional plan frame</p>
          <ol className="mt-2 space-y-1 text-stone-600">
            {writing.planFrame.map((point, index) => <li key={point}>{index + 1}. {point}</li>)}
          </ol>
        </div>
        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4 text-[11px] leading-5">
          <p className="text-xs font-bold text-stone-900">Useful language · hidden until the plan is done</p>
          <ul className="space-y-1 text-stone-600">
            {writing.usefulLanguage.map((phrase) => <li key={phrase}>• {phrase}</li>)}
          </ul>
          <p className="border-t border-stone-100 pt-2 text-stone-700">
            <strong className="font-semibold text-stone-900">On target:</strong> {writing.onTarget}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 text-[11px] leading-5">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
            <Sparkles className="h-3.5 w-3.5 text-indigo-700" /> Feedback priorities
          </p>
          <p className="mt-2 text-stone-700">{writing.correctionPriority}</p>
          <p className="mt-2 border-t border-stone-100 pt-2 text-stone-600">
            <strong className="font-semibold text-stone-800">Revise and retry:</strong> {writing.reviseAndRetryFocus}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-bold text-stone-900">Delayed recall · a few days later</p>
          <p className="mt-2 text-stone-700">{writing.delayedRecall}</p>
        </div>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
        <button
          type="button"
          onClick={() => setShowModel((value) => !value)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-900"
        >
          {showModel ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showModel ? 'Hide model answer' : 'Reveal model answer · shown after the first submission'}
        </button>
        {showModel && (
          <blockquote className="mt-3 whitespace-pre-line font-serif text-sm leading-7 text-stone-800">
            “{writing.modelAnswer}”
          </blockquote>
        )}
      </div>
      <p className="text-[10px] leading-5 text-stone-500">Pilot draft — awaiting the second-teacher review checklist.</p>
    </section>
  );
}
