'use client';

import { ACTION_BUTTON_CLASS } from '@/lib/curriculum/week-tasks.mjs';
import { useState } from 'react';

type Feedback = { onTarget: boolean; good: string; corrected: string; tip: string; addedToReview: boolean };

/**
 * The answer box shared by the three places on /week/[n] that ask the learner to
 * write their own sentence: grammar "Fix it" rewrites, grammar "Use it", and
 * vocabulary step 7.
 *
 * It only ever receives `week` and `id`; the target form and the answer key stay
 * on the server.
 */
export default function SentenceBox({
  week,
  id,
  prompt,
  label,
  signedIn,
  rows = 2,
  onChecked,
  initialAnswer,
  freezeWhileChecking = false,
}: {
  week: number;
  id: string;
  prompt: string;
  label?: string;
  signedIn: boolean;
  rows?: number;
  onChecked?: (onTarget: boolean, answer: string) => void;
  /** Prevent a result for an older draft appearing beside an edited sentence. */
  freezeWhileChecking?: boolean;
  /**
   * What the learner wrote last time, restored from the server so a reload does
   * not empty the box. It is only the sentence they wrote: the feedback comes
   * back with the next check.
   */
  initialAnswer?: string;
}) {
  const [answer, setAnswer] = useState(initialAnswer ?? '');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function check() {
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/week/sentence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, id, answer }),
      });
      const data = (await response.json()) as Feedback & { error?: string };
      if (!response.ok) {
        console.error('[sentence] check failed:', data.error ?? response.status);
        setError(data.error || 'We could not check your answer. Please try again.');
        return;
      }
      setFeedback(data);
      onChecked?.(data.onTarget, answer);
    } catch (err) {
      console.error('[sentence] check failed:', err);
      setError('We could not check your answer. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputId = `sentence-${id}`;

  return (
    <div className="space-y-2 rounded-xl bg-stone-50 p-4">
      <label htmlFor={inputId} className="block font-medium">
        {prompt}
      </label>
      <textarea
        id={inputId}
        value={answer}
        rows={rows}
        maxLength={600}
        disabled={freezeWhileChecking && busy}
        onChange={(event) => {
          setAnswer(event.target.value);
          setFeedback(null);
        }}
        aria-describedby={`${inputId}-help`}
        className="w-full rounded-lg border border-stone-300 bg-white p-2"
        placeholder={label ?? 'Write your sentence here.'}
      />
      <p id={`${inputId}-help`} className="text-sm text-stone-600">
        Write your sentences and press Check. The app will give you feedback.
      </p>
      <button
        type="button"
        disabled={!signedIn || busy || !answer.trim()}
        onClick={check}
        className={ACTION_BUTTON_CLASS}
      >
        {busy ? 'Checking…' : 'Check'}
      </button>
      {feedback && (
        <div role="status" className="space-y-1 rounded-lg bg-white p-3 text-sm">
          <p className="text-emerald-800">{feedback.good}</p>
          <p>
            <span className="font-semibold">Corrected sentence: </span>
            {feedback.corrected}
          </p>
          <p className="text-stone-700">{feedback.tip}</p>
          {feedback.addedToReview && (
            <p className="text-stone-600">I added this to your Review cards so you can practise it again.</p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
