'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { Evaluation, SpeakingTask, WritingTask } from '@/lib/b1b2/types';

function countWords(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function extensionFor(mimeType: string) {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

const SCORE_LABEL: Record<string, string> = {
  fluency: 'Fluency',
  lexical_range: 'Vocabulary range',
  grammar_accuracy: 'Grammar accuracy',
  coherence: 'Coherence',
  pronunciation: 'Pronunciation',
  task_response: 'Task response',
  organisation: 'Organisation',
  style: 'Style',
};

export function EvaluationPanel({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-emerald-950">Examiner feedback</p>
        <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">{evaluation.overall}/100</span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {Object.entries(evaluation.scores).map(([criterion, score]) => (
          <div key={criterion}>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="font-semibold text-emerald-900">{SCORE_LABEL[criterion] ?? criterion.replace(/_/g, ' ')}</span>
              <span className="text-emerald-800">{score}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, score)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm leading-6 text-emerald-950">{evaluation.feedback}</p>

      {evaluation.strengths.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-emerald-900">
          {evaluation.strengths.map((item) => (
            <li key={item}>✓ {item}</li>
          ))}
        </ul>
      )}
      {evaluation.improvements.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-900">
          {evaluation.improvements.map((item) => (
            <li key={item}>→ {item}</li>
          ))}
        </ul>
      )}
      {evaluation.corrected && (
        <p className="mt-3 rounded-lg bg-white p-3 text-xs italic leading-5 text-slate-700">{evaluation.corrected}</p>
      )}
      {evaluation.transcript && (
        <details className="mt-3 text-xs text-emerald-900">
          <summary className="cursor-pointer font-semibold">Transcript</summary>
          <p className="mt-1 leading-5">{evaluation.transcript}</p>
        </details>
      )}
    </div>
  );
}

export default function OutputStudio({
  lessonId,
  lessonNumber,
  signedIn,
  writing,
  speaking,
  onSubmitted,
  onEvaluated,
  signInLabel = 'Sign in to submit',
}: {
  lessonId: string | null;
  lessonNumber: number | null;
  signedIn: boolean;
  writing: WritingTask | null;
  speaking: SpeakingTask | null;
  onSubmitted?: (kind: 'speaking' | 'writing', id: string) => void;
  onEvaluated?: (kind: 'speaking' | 'writing', evaluation: Evaluation) => void;
  signInLabel?: string;
}) {
  const supabase = createClient();
  const [writingBody, setWritingBody] = useState('');
  const [writingId, setWritingId] = useState<string | null>(null);
  const [writingEval, setWritingEval] = useState<Evaluation | null>(null);
  const [savingWriting, setSavingWriting] = useState(false);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; mimeType: string } | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [speakingEval, setSpeakingEval] = useState<Evaluation | null>(null);
  const [savingSpeaking, setSavingSpeaking] = useState(false);
  const [error, setError] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const targetSeconds = speaking?.target_seconds ?? 90;
  const maxSeconds = Math.round(targetSeconds * 1.5);

  useEffect(() => {
    if (!recording) return;
    let seconds = 0;
    const timer = window.setInterval(() => {
      seconds += 1;
      setElapsed(seconds);
      if (seconds >= maxSeconds) {
        recorderRef.current?.stop();
        recorderRef.current = null;
        setRecording(false);
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording, maxSeconds]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (clipUrl) URL.revokeObjectURL(clipUrl);
    };
  }, [clipUrl]);

  async function refreshUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  }

  async function startRecording() {
    setError('');
    const mimeType = pickMimeType();
    if (mimeType === null) {
      setError('This browser cannot record audio. Try Chrome, Edge or Safari.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        setClip({ blob, mimeType: type });
        setClipUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorder.start();
      recorderRef.current = recorder;
      setElapsed(0);
      setClip(null);
      setSpeakingId(null);
      setSpeakingEval(null);
      setRecording(true);
    } catch {
      setError('Microphone access was blocked. Allow it in your browser settings and try again.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function score(kind: 'speaking' | 'writing', id: string) {
    const response = await fetch('/api/curriculum/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kind === 'speaking' ? { kind, attemptId: id } : { kind, submissionId: id }),
    });
    const payload = (await response.json().catch(() => ({}))) as { evaluation?: Evaluation; error?: string };
    if (!response.ok || !payload.evaluation) {
      throw new Error(payload.error ?? 'The examiner could not score that submission.');
    }
    return payload.evaluation;
  }

  async function submitRecording() {
    if (!clip || !speaking) return;
    setSavingSpeaking(true);
    setError('');
    try {
      const user = await refreshUser();
      if (!user) throw new Error('Sign in again to save your recording.');
      const path = `${user.id}/${lessonId ?? 'checkpoint'}/${crypto.randomUUID()}.${extensionFor(clip.mimeType)}`;
      const { error: uploadError } = await supabase.storage.from('speaking-recordings').upload(path, clip.blob, {
        contentType: clip.mimeType,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data: inserted, error: insertError } = await supabase
        .from('speaking_attempts')
        .insert({
          user_id: user.id,
          task_id: speaking.id,
          lesson_id: lessonId,
          audio_path: path,
          mime_type: clip.mimeType,
          duration_seconds: elapsed,
          status: 'submitted',
        })
        .select('id')
        .single();
      if (insertError || !inserted) throw insertError ?? new Error('Could not save that recording.');

      setSpeakingId(inserted.id);
      onSubmitted?.('speaking', inserted.id);

      try {
        const evaluation = await score('speaking', inserted.id);
        setSpeakingEval(evaluation);
        onEvaluated?.('speaking', evaluation);
      } catch (scoringError) {
        setError(scoringError instanceof Error ? scoringError.message : 'Saved, but scoring failed.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that recording.');
    } finally {
      setSavingSpeaking(false);
    }
  }

  async function submitWriting() {
    if (!writing) return;
    setSavingWriting(true);
    setError('');
    try {
      const user = await refreshUser();
      if (!user) throw new Error('Sign in again to save your writing.');
      const { data: inserted, error: insertError } = await supabase
        .from('writing_submissions')
        .insert({
          user_id: user.id,
          task_id: writing.id,
          lesson_id: lessonId,
          body: writingBody,
          word_count: countWords(writingBody),
          status: 'submitted',
        })
        .select('id')
        .single();
      if (insertError || !inserted) throw insertError ?? new Error('Could not save that draft.');

      setWritingId(inserted.id);
      onSubmitted?.('writing', inserted.id);

      try {
        const evaluation = await score('writing', inserted.id);
        setWritingEval(evaluation);
        onEvaluated?.('writing', evaluation);
      } catch (scoringError) {
        setError(scoringError instanceof Error ? scoringError.message : 'Saved, but scoring failed.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that draft.');
    } finally {
      setSavingWriting(false);
    }
  }

  if (!speaking && !writing) return null;

  if (!signedIn) {
    return (
      <div className="rounded-xl bg-slate-50 p-4">
        <p className="text-sm text-slate-700">
          Output is saved to your account{speaking ? ' — record a take' : ''}
          {writing ? ' and your drafts get examiner feedback' : ''}.
        </p>
        {lessonNumber ? (
          <Link
            href={`/login?next=/curriculum/lessons/${lessonNumber}`}
            className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {signInLabel}
          </Link>
        ) : (
          <Link href="/login" className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            {signInLabel}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {speaking && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900">{speaking.title}</p>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
              {(speaking.kind ?? 'speaking').replace(/_/g, ' ')} · {targetSeconds}s
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{speaking.prompt}</p>
          {speaking.useful_phrases?.length ? (
            <p className="mt-2 text-xs text-slate-500">Useful phrases: {speaking.useful_phrases.join(' · ')}</p>
          ) : null}
          {speaking.target_linkers?.length ? (
            <p className="mt-1 text-xs text-slate-500">Target linkers: {speaking.target_linkers.join(' · ')}</p>
          ) : null}
          {speaking.target_terms?.length ? (
            <p className="mt-1 text-xs text-slate-500">Target terms: {speaking.target_terms.join(' · ')}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={savingSpeaking}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:bg-slate-300"
              >
                {clip ? 'Record again' : 'Record'}
              </button>
            ) : (
              <button type="button" onClick={stopRecording} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                Stop · {elapsed}s / {maxSeconds}s
              </button>
            )}
            {recording && <span className="text-xs font-semibold text-rose-700">● Recording… aim for {targetSeconds} seconds</span>}
          </div>

          {clip && clipUrl && (
            <div className="mt-3 space-y-2">
              <audio controls src={clipUrl} className="w-full" />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={submitRecording}
                  disabled={savingSpeaking || Boolean(speakingId)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                >
                  {speakingId ? 'Recording saved' : savingSpeaking ? 'Uploading…' : 'Submit for feedback'}
                </button>
                <span className="text-xs text-slate-500">{elapsed}s captured</span>
              </div>
            </div>
          )}

          {speakingEval && <EvaluationPanel evaluation={speakingEval} />}
        </div>
      )}

      {writing && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900">{writing.title}</p>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              {writing.format} · {writing.word_min}–{writing.word_max} words
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{writing.prompt}</p>
          {writing.outline && Object.keys(writing.outline).length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {Object.entries(writing.outline).map(([part, guidance]) => (
                <li key={part}>
                  <span className="font-semibold capitalize text-slate-700">{part}:</span> {guidance}
                </li>
              ))}
            </ul>
          )}
          <textarea
            value={writingBody}
            onChange={(event) => {
              setWritingBody(event.target.value);
              setWritingId(null);
              setWritingEval(null);
            }}
            rows={10}
            placeholder="Plan, draft, then improve before you submit."
            className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className={`text-xs font-semibold ${countWords(writingBody) >= writing.word_min ? 'text-emerald-700' : 'text-slate-500'}`}>
              {countWords(writingBody)} words · target {writing.word_min}–{writing.word_max}
            </span>
            <button
              type="button"
              onClick={submitWriting}
              disabled={savingWriting || Boolean(writingId) || countWords(writingBody) < 20}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {writingId ? 'Draft submitted' : savingWriting ? 'Saving…' : 'Submit for feedback'}
            </button>
          </div>

          {writingEval && <EvaluationPanel evaluation={writingEval} />}
        </div>
      )}

      {error && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
    </div>
  );
}
