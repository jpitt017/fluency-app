'use client';

import { useRef, useState } from 'react';
import { browserDeletionGeneration, DELETION_EPOCH_HEADER } from '@/lib/b1b2/deletion-epoch.mjs';
import type { WeekMediation } from '@/lib/curriculum/syllabus';

interface MediationFeedback {
  attemptId?: string;
  needsReview?: boolean;
  reviewReason?: string | null;
  criteria: { label: string; note: string }[];
  readerNeed: string;
  feedback: string;
  suggestion: string;
}

export default function MediationTask({
  weekNumber,
  task,
}: {
  weekNumber: number;
  task: WeekMediation;
}) {
  const isVoice = /voice message/i.test(task.output);
  const taskKey = `week-${weekNumber}-mediation`;
  const [mode, setMode] = useState<'voice' | 'text'>(isVoice ? 'voice' : 'text');
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<MediationFeedback | null>(null);
  const [disputed, setDisputed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function requestFeedback(submission: string, submissionMode: 'voice' | 'text', generation = browserDeletionGeneration()) {
    setLoading(true);
    setError(null);
    setFeedback(null);
    setDisputed(false);
    try {
      const response = await fetch('/api/mediation/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [DELETION_EPOCH_HEADER]: generation },
        body: JSON.stringify({
          text: submission,
          prompt: task.prompt,
          output: task.output,
          source: task.source,
          scale: task.scale,
          level: task.level,
          week: weekNumber,
          taskKey,
          mode: submissionMode,
        }),
      });
      const data = (await response.json().catch(() => null)) as (MediationFeedback & { error?: string }) | null;
      if (!response.ok || !data) {
        console.error('[mediation] feedback failed:', data?.error ?? response.status);
        setError(data?.error || 'Something went wrong. Please try again, or message your teacher.');
        return;
      }
      setFeedback(data);
    } catch (caught) {
      console.error('[mediation] feedback failed:', caught);
      setError('Something went wrong. Please try again, or message your teacher.');
    } finally {
      setLoading(false);
    }
  }

  async function disputeFeedback() {
    if (!feedback?.attemptId || disputed) return;
    setLoading(true);
    try {
      const response = await fetch('/api/mediation/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: feedback.attemptId }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data) {
        console.error('[mediation] report failed:', data?.error ?? response.status);
        setError(data?.error || 'Something went wrong. Please try again, or message your teacher.');
        return;
      }
      setDisputed(true);
    } catch (caught) {
      console.error('[mediation] report failed:', caught);
      setError('Something went wrong. Please try again, or message your teacher.');
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    const generation = browserDeletionGeneration();
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording is not supported in this browser. Use the text option instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const form = new FormData();
        form.set('audio', new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }), 'mediation.webm');
        form.set('prompt', task.prompt);
        form.set('targetPhrase', `${task.scale}, ${task.level}`);
        try {
          // Transcription-only: 2 units, no speaking rubric or pronunciation score.
          const transcription = await fetch('/api/speaking/transcribe', { method: 'POST', headers: { [DELETION_EPOCH_HEADER]: generation }, body: form });
          const data = (await transcription.json().catch(() => null)) as { transcript?: string; error?: string } | null;
          if (!transcription.ok || !data) {
            console.error('[mediation] recording check failed:', data?.error ?? transcription.status);
            setError(data?.error || 'Something went wrong. Please try again, or message your teacher.');
            return;
          }
          if (!data.transcript) {
            setError('We could not hear any words. Please try again or write your answer.');
            return;
          }
          setText(data.transcript);
          await requestFeedback(data.transcript, 'voice', generation);
        } catch (caught) {
          console.error('[mediation] recording check failed:', caught);
          setError('Something went wrong. Please try again, or message your teacher.');
        }
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError('Microphone access was denied. Use the text option instead.');
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      setRecording(false);
    }
  }

  return (
    <section aria-label={`Week ${weekNumber} mediation task`} className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-800">
          Recommended · 10 minutes
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-stone-600">
          Does not affect unlocking
        </span>
        <span className="text-[11px] text-stone-600">{task.scale} · {task.level}</span>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Mediation task</p>
        <p className="mt-1.5 text-sm leading-6 text-stone-800">{task.prompt}</p>
        <p className="mt-1 text-xs text-stone-600">
          Source: {task.source} · Output: {task.output}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode('voice')}
          className={`rounded-full border px-3 py-1.5 font-semibold ${mode === 'voice' ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-stone-300 bg-white text-stone-700'}`}
        >
          Record voice message
        </button>
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`rounded-full border px-3 py-1.5 font-semibold ${mode === 'text' ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-stone-300 bg-white text-stone-700'}`}
        >
          Type instead
        </button>
      </div>

      {mode === 'voice' ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={loading}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${recording ? 'bg-rose-600' : 'bg-emerald-700'} disabled:opacity-50`}
          >
            {recording ? 'Stop recording' : loading ? 'Checking…' : 'Start recording'}
          </button>
          <span className="text-xs text-stone-600">Target length: {task.output}</span>
        </div>
      ) : (
        <textarea
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={`Write your ${(task.output ?? 'response').toLowerCase()} here…`}
          className="w-full rounded-xl border border-stone-300 bg-white p-3.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      )}

      {mode === 'text' && (
        <button
          type="button"
          onClick={() => requestFeedback(text, 'text')}
          disabled={loading || !text.trim()}
          className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Get mediation feedback'}
        </button>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {feedback && (
        <div role="status" className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Four criteria</p>
            <ul className="mt-2 space-y-1.5">
              {feedback.criteria.map((item) => (
                <li key={item.label}>
                  <strong className="font-semibold text-stone-900">{item.label}:</strong>{' '}
                  <span className="text-stone-700">{item.note}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-900">
            Did the reader get what they need? {feedback.readerNeed}
          </p>
          <p className="text-stone-700">{feedback.feedback}</p>
          <p className="text-xs text-stone-600">Next time: {feedback.suggestion}</p>
          <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-3 text-xs text-stone-600">
            <span>Saved to your mediation practice log.</span>
            {feedback.needsReview && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900">
                Teacher check: {feedback.reviewReason?.replace(/_/g, ' ') ?? 'flagged'}
              </span>
            )}
            <button
              type="button"
              disabled={loading || disputed || !feedback.attemptId}
              onClick={() => void disputeFeedback()}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            >
              {disputed ? 'Flagged for teacher' : 'I think this is right'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
