'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LearnerQuestion } from '@/lib/curriculum/learner-week';

export default function WeekInputTask({ week, skill, questions, available, signedIn }: { week: number; skill: 'reading' | 'listening'; questions: LearnerQuestion[]; available: boolean; signedIn: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/week/input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week, skill, answers }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not save your answers.');
      setMessage('Your answers are saved.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <ol className="space-y-4">{questions.map((q, index) => <li key={q.id} className="rounded-xl bg-stone-50 p-4">
      <fieldset><legend className="font-medium">{index + 1}. {q.question}</legend>
        {q.options.length ? <div className="mt-2 space-y-1">{q.options.map((option) => <label key={option} className="flex gap-2 text-sm text-stone-700">
          <input type="radio" name={q.id} value={option} required checked={answers[q.id] === option} onChange={() => setAnswers({ ...answers, [q.id]: option })} />{option}
        </label>)}</div> : <input aria-label={`Answer to question ${index + 1}`} required maxLength={500} value={answers[q.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} className="mt-2 w-full rounded border border-stone-300 bg-white p-2" />}
      </fieldset>
    </li>)}</ol>
    {available && signedIn && <button disabled={busy} className="rounded-xl bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save answers'}</button>}
    {available && !signedIn && <p className="text-sm text-stone-600">Sign in to save your answers.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
