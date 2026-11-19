'use client';

import Link from 'next/link';
import { useState } from 'react';
import PracticeQuiz from '@/components/b1b2/PracticeQuiz';
import OutputStudio from '@/components/b1b2/OutputStudio';
import { createClient } from '@/utils/supabase/client';
import type { CheckpointAttempt, CheckpointPayload, Evaluation } from '@/lib/b1b2/types';

const BAND_COPY: Record<string, { label: string; className: string; advice: string }> = {
  strong: { label: 'Strong', className: 'bg-emerald-100 text-emerald-900', advice: 'Move on to the next module — the evidence is there.' },
  on_track: { label: 'On track', className: 'bg-indigo-100 text-indigo-900', advice: 'Solid pass. Revisit the weakest criterion before the next checkpoint.' },
  needs_work: { label: 'Needs work', className: 'bg-amber-100 text-amber-900', advice: 'Redo the weakest task after another week of lessons.' },
  ungraded: { label: 'Saved without a score', className: 'bg-slate-100 text-slate-700', advice: 'Submit a recording or a draft to get an examiner score.' },
};

export default function CheckpointRunner({ payload, signedIn }: { payload: CheckpointPayload; signedIn: boolean }) {
  const { checkpoint, items, speaking, writing } = payload;
  const supabase = createClient();

  const [quiz, setQuiz] = useState({ correct: 0, total: items.length });
  const [scores, setScores] = useState<Record<string, number>>({});
  const [speakingAttemptId, setSpeakingAttemptId] = useState<string | null>(null);
  const [writingSubmissionId, setWritingSubmissionId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<CheckpointAttempt | null>(payload.attempt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hasOutputs = Boolean(speaking || writing);
  const readiness = [
    { label: 'Quiz', done: quiz.correct > 0 },
    { label: 'Speaking', done: Boolean(speakingAttemptId) || !speaking },
    { label: 'Writing', done: Boolean(writingSubmissionId) || !writing },
  ];

  function recordEvaluation(kind: 'speaking' | 'writing', evaluation: Evaluation) {
    setScores((current) => ({ ...current, [kind]: evaluation.overall }));
  }

  async function complete() {
    setSaving(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('complete_checkpoint', {
        p_code: checkpoint.code,
        p_scores: scores,
        p_quiz_correct: quiz.correct,
        p_quiz_total: quiz.total,
        p_speaking_attempt_id: speakingAttemptId,
        p_writing_submission_id: writingSubmissionId,
      });
      if (rpcError) throw rpcError;
      const result = (data as { attempt_id?: string; result?: CheckpointAttempt['result'] } | null) ?? {};
      setAttempt({
        id: result.attempt_id ?? crypto.randomUUID(),
        status: 'evaluated',
        scores,
        result: result.result ?? null,
        completed_at: new Date().toISOString(),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record that checkpoint.');
    } finally {
      setSaving(false);
    }
  }

  const band = attempt?.result?.band ? BAND_COPY[attempt.result.band] ?? BAND_COPY.ungraded : null;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">1. Grammar and vocabulary quiz</h2>
        <p className="mt-1 text-xs text-slate-500">
          {items.length} mixed items drawn from every lesson up to this checkpoint. Answers stay hidden until you check each one.
        </p>
        {items.length ? (
          <PracticeQuiz
            items={items.map((item) => ({
              id: item.id,
              prompt: item.prompt,
              options: item.options,
              answer: item.answer,
              explanation: item.explanation,
            }))}
            onScoreChange={(correct, total) => setQuiz({ correct, total })}
          />
        ) : (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            {signedIn ? 'This checkpoint has no quiz items yet.' : 'Sign in to see the quiz items.'}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">2. Speaking and writing</h2>
        <p className="mt-1 text-xs text-slate-500">Both are scored against the five-criterion B2 rubric and saved to your attempt.</p>
        <div className="mt-3">
          {hasOutputs ? (
            <OutputStudio
              lessonId={null}
              lessonNumber={null}
              signedIn={signedIn}
              speaking={speaking}
              writing={writing}
              signInLabel="Sign in to take the checkpoint"
              onSubmitted={(kind, id) => {
                if (kind === 'speaking') setSpeakingAttemptId(id);
                else setWritingSubmissionId(id);
              }}
              onEvaluated={recordEvaluation}
            />
          ) : (
            <p className="text-sm text-slate-600">This checkpoint is quiz-only.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">3. Record the attempt</h2>
        <ul className="mt-2 flex flex-wrap gap-3 text-xs">
          {readiness.map((item) => (
            <li key={item.label} className={`rounded-full px-2.5 py-1 font-semibold ${item.done ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
              {item.done ? '✓' : '○'} {item.label}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Quiz {quiz.correct}/{quiz.total || items.length}
          {typeof scores.speaking === 'number' ? ` · Speaking ${scores.speaking}` : ''}
          {typeof scores.writing === 'number' ? ` · Writing ${scores.writing}` : ''}
        </p>

        {attempt?.result ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-emerald-950">Checkpoint recorded</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${band?.className ?? 'bg-slate-100 text-slate-700'}`}>{band?.label}</span>
            </div>
            <p className="mt-2 text-xs text-emerald-900">
              Overall {attempt.result.overall ?? '—'} · Quiz {attempt.result.quiz_correct}/{attempt.result.quiz_total}
              {attempt.result.quiz_percent !== null ? ` (${attempt.result.quiz_percent}%)` : ''} · +150 XP
            </p>
            <p className="mt-1 text-xs text-emerald-800">{band?.advice}</p>
            <Link href="/dashboard" className="mt-3 inline-block text-xs font-semibold text-emerald-900 underline">
              See it on your dashboard →
            </Link>
          </div>
        ) : signedIn ? (
          <button
            type="button"
            onClick={complete}
            disabled={saving}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {saving ? 'Recording…' : 'Complete checkpoint (+150 XP)'}
          </button>
        ) : (
          <Link href="/login" className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Sign in to take the checkpoint
          </Link>
        )}
        {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      </section>
    </div>
  );
}
