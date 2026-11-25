'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LearnerQuestion } from '@/lib/curriculum/learner-week';

type Marked = { correct: boolean; reason: string | null; sourceLine?: string | null };

function Question({
  week,
  skill,
  question,
  index,
  signedIn,
  finishing,
  onAnswered,
  onChanged,
}: {
  week: number;
  skill: 'reading' | 'listening';
  question: LearnerQuestion;
  index: number;
  signedIn: boolean;
  finishing: boolean;
  onAnswered: (id: string, correct: boolean) => void;
  onChanged: (id: string) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [marked, setMarked] = useState<Marked | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function check() {
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/week/input/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, skill, id: question.id, answer }),
      });
      const data = (await response.json()) as Marked & { error?: string };
      if (!response.ok) {
        console.error('[week-input] check failed:', data.error ?? response.status);
        setError(data.error || 'We could not check your answer. Please try again.');
        return;
      }
      setMarked(data);
      onAnswered(question.id, data.correct);
    } catch (err) {
      console.error('[week-input] check failed:', err);
      setError('We could not check your answer. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl bg-stone-50 p-4">
      <fieldset>
        <legend className="font-medium">
          {index + 1}. {question.question}
        </legend>
        {question.options.length ? (
          <div className="mt-2 space-y-1">
            {question.options.map((option) => (
              <label key={option} className="flex gap-2 text-sm text-stone-700">
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={answer === option}
                  disabled={busy || finishing}
                  onChange={() => {
                    setAnswer(option);
                    setMarked(null);
                    onChanged(question.id);
                  }}
                />
                {option}
              </label>
            ))}
          </div>
        ) : (
          <input
            aria-label={`Answer to question ${index + 1}`}
            maxLength={500}
            value={answer}
            disabled={busy || finishing}
            onChange={(event) => {
              setAnswer(event.target.value);
              setMarked(null);
              onChanged(question.id);
            }}
            className="mt-2 w-full rounded border border-stone-300 bg-white p-2"
          />
        )}
      </fieldset>
      <button
        type="button"
        disabled={!signedIn || busy || finishing || !answer.trim()}
        onClick={check}
        className="mt-2 rounded-lg bg-indigo-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'Check'}
      </button>
      {marked && (
        <div role="status" className={marked.correct ? 'mt-2 text-emerald-800' : 'mt-2 text-amber-900'}>
          <strong>{marked.correct ? 'Correct. ' : 'Not quite. '}</strong>
          {marked.reason}
          {marked.sourceLine && <p className="mt-1 text-sm italic text-stone-600">“{marked.sourceLine}”</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}

export default function WeekInputTask({
  week,
  skill,
  questions,
  available,
  signedIn,
}: {
  week: number;
  skill: 'reading' | 'listening';
  questions: LearnerQuestion[];
  available: boolean;
  signedIn: boolean;
}) {
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const answered = Object.keys(results).length;
  const correct = Object.values(results).filter(Boolean).length;

  async function finish() {
    setBusy(true);
    setMessage('');
    try {
      // Completion is recorded once every question has been marked: the answers
      // are already saved one at a time by the marking endpoint.
      const response = await fetch('/api/week/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, skill }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        console.error('[week-input] save failed:', result.error ?? response.status);
        setMessage(result.error || 'We could not save your progress. Please try again.');
        return;
      }
      setMessage('Your answers are saved.');
      router.refresh();
    } catch (error) {
      console.error('[week-input] save failed:', error);
      setMessage('We could not save your progress. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {questions.map((question, index) => (
          <Question
            key={question.id}
            week={week}
            skill={skill}
            question={question}
            index={index}
            signedIn={signedIn}
            finishing={busy}
            onAnswered={(id, isCorrect) => {
              setMessage('');
              setResults((prev) => ({ ...prev, [id]: isCorrect }));
            }}
            onChanged={(id) => {
              setMessage('');
              setResults((prev) => {
                if (!(id in prev)) return prev;
                const next = { ...prev };
                delete next[id];
                return next;
              });
            }}
          />
        ))}
      </ol>
      {answered > 0 && (
        <p className="text-sm text-stone-600">
          {correct} of {answered} correct so far.
        </p>
      )}
      {available && signedIn && answered === questions.length && (
        <button
          type="button"
          disabled={busy}
          onClick={finish}
          className="rounded-xl bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Finish and save'}
        </button>
      )}
      {available && !signedIn && <p className="text-sm text-stone-600">Sign in to check and save your answers.</p>}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
