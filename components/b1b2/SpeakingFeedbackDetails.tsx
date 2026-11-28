'use client';

import { useEffect, useRef, useState } from 'react';
import { speakPhrase } from '@/lib/b1b2/speech';
import { browserDeletionGeneration, DELETION_EPOCH_HEADER } from '@/lib/b1b2/deletion-epoch.mjs';
import { structureUsed, type ShortSpeakingFeedback, type StructurePoint } from '@/lib/b1b2/speaking-feedback.mjs';

type PracticeResult = { transcript: string; used: boolean };
type PracticeState = { id: string; status: string; transcript: string | null; used: boolean | null } | null;

/** One browser recording. Nothing leaves the device until onRecorded is called. */
export function RecordButton({ label, disabled, onRecorded }: { label: string; disabled?: boolean; onRecorded: (blob: Blob, generation: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const startingRef = useRef(false);
  const recorded = useRef(onRecorded);
  useEffect(() => { recorded.current = onRecorded; }, [onRecorded]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, []);
  async function start() {
    // A second click while the permission dialog is open must not start a
    // second microphone. A late permission grant after unmount is closed too.
    if (startingRef.current || recorder.current?.state === 'recording') return;
    // Keep the recording's starting epoch even if another tab deletes data
    // while the microphone permission dialog or recording is open.
    const deletionEpoch = browserDeletionGeneration();
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Audio recording is not supported in this browser.');
      return;
    }
    startingRef.current = true;
    setStarting(true);
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { input.getTracks().forEach((track) => track.stop()); return; }
      stream.current = input;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      const next = new MediaRecorder(input, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.current = next;
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => {
        input.getTracks().forEach((track) => track.stop());
        if (stream.current === input) stream.current = null;
        if (recorder.current === next) recorder.current = null;
        if (!mounted.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: next.mimeType || 'audio/webm' });
        if (blob.size) recorded.current(blob, deletionEpoch);
        else setError('No recording was made. Please try again.');
      };
      next.start();
      setRecording(true);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      recorder.current = null;
      if (mounted.current) setError('Microphone access is unavailable. Check your browser permissions.');
    } finally {
      startingRef.current = false;
      if (mounted.current) setStarting(false);
    }
  }
  return <div className="space-y-1">
    {recording
      ? <button type="button" onClick={() => recorder.current?.stop()} className="min-h-11 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white">Stop recording</button>
      : <button type="button" disabled={disabled || starting} onClick={() => void start()} className="min-h-11 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-50">{starting ? 'Starting microphone…' : label}</button>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>;
}

function SoundPractice({ word, label, tip }: { word: string; label: string; tip: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return <li className="space-y-2 rounded-lg bg-white p-3">
    <p><strong>{word}</strong> · {label}</p>
    <p>{tip}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => void speakPhrase(word, 'en-GB')} className="min-h-11 rounded-lg border border-stone-300 px-3 py-2 font-semibold">Listen to {word}</button>
      <RecordButton label={`Record ${word}`} onRecorded={(blob) => setUrl(URL.createObjectURL(blob))} />
    </div>
    {url && <audio controls src={url} aria-label={`Your recording of ${word}`} className="max-w-full" />}
  </li>;
}

async function transcribePractice(blob: Blob, point: StructurePoint, generation: string): Promise<PracticeResult> {
  const form = new FormData();
  form.set('audio', blob, 'sentence.webm');
  const response = await fetch('/api/speaking/transcribe', { method: 'POST', headers: { [DELETION_EPOCH_HEADER]: generation }, body: form });
  const data = await response.json() as { transcript?: string; error?: string };
  if (!response.ok || !data.transcript) throw new Error(data.error || 'We could not check this sentence.');
  return { transcript: data.transcript, used: structureUsed(data.transcript, point.structure) };
}

export default function SpeakingFeedbackDetails({
  feedback, practice = null, onPractice, onRecheckPractice, practiceAllowed = true,
  practiceUnavailableMessage = 'No weekly checks remain for this extra practice.',
}: {
  feedback: ShortSpeakingFeedback;
  practice?: PracticeState;
  onPractice?: (blob: Blob, generation: string) => Promise<PracticeResult>;
  onRecheckPractice?: (takeId: string) => Promise<PracticeResult>;
  practiceAllowed?: boolean;
  practiceUnavailableMessage?: string;
}) {
  const [localResult, setLocalResult] = useState<PracticeResult | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const point = feedback.structure;
  const savedResult = practice?.status === 'checked' && practice.transcript && typeof practice.used === 'boolean'
    ? { transcript: practice.transcript, used: practice.used } : null;
  const result = localResult ?? savedResult;
  async function run(blob: Blob, generation: string) {
    if (!point) return;
    setAttempted(true);
    setBusy(true);
    setError('');
    try { setLocalResult(await (onPractice ? onPractice(blob, generation) : transcribePractice(blob, point, generation))); }
    catch (cause) {
      // A failed capture must not permanently disable the button. If the
      // weekly audio was saved, refresh instead exposes its recheck button.
      setAttempted(false);
      setError(cause instanceof Error ? cause.message : 'We could not check this sentence.');
    }
    finally { setBusy(false); }
  }
  async function recheck() {
    if (!practice || !onRecheckPractice) return;
    setBusy(true); setError('');
    try { setLocalResult(await onRecheckPractice(practice.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'We could not check this sentence.'); }
    finally { setBusy(false); }
  }
  const f = feedback.fluency;
  return <div className="space-y-4 text-sm">
    {typeof feedback.score === 'number' && <p className="font-semibold">Content and grammar · {feedback.score}%</p>}
    {feedback.transcript && <div><p className="text-xs font-bold uppercase text-stone-500">Your transcript</p><p className="mt-1 whitespace-pre-line">{feedback.transcript}</p></div>}
    {f && <div className="rounded-lg bg-sky-50 p-3" aria-label="Fluency information">
      <p className="font-semibold">Fluency</p>
      <p>{f.wordsPerMinute === null ? 'Speaking speed is not available.' : `About ${f.wordsPerMinute} words a minute.`}{' '}
        {f.pauses === null ? 'Pause information is not available.' : `${f.pauses} ${f.pauses === 1 ? 'pause' : 'pauses'} over one second between speech sections.`}</p>
      <p className="mt-1 text-xs text-stone-600">Only gaps between transcript sections are counted. Speed and pauses do not change your score.</p>
    </div>}
    {point && <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3" aria-label="Build a better sentence">
      <h4 className="font-semibold">Build a better sentence</h4>
      <p><span className="font-medium">You said:</span> {point.original}</p>
      <p><span className="font-medium">Try:</span> {point.upgraded}</p>
      <p>{point.explanation}</p>
      {!result && !practice && <RecordButton label={busy ? 'Checking…' : 'Say it again'} disabled={busy || attempted || !practiceAllowed} onRecorded={(blob, generation) => void run(blob, generation)} />}
      {!practiceAllowed && !result && <p className="text-xs text-stone-600">{practiceUnavailableMessage}</p>}
      {practice && ['ready', 'checking'].includes(practice.status) && onRecheckPractice && <button type="button" disabled={busy || !practiceAllowed} onClick={() => void recheck()} className="min-h-11 rounded-lg border border-indigo-300 bg-white px-3 py-2 font-semibold disabled:opacity-50">{busy ? 'Checking…' : 'Check this saved sentence again'}</button>}
      {result && <p role="status" className="rounded-lg bg-white p-2">{result.used ? `We found ${point.structure} in your transcript.` : `We could not find ${point.structure} in your transcript.`} This checks the pattern, not all your grammar or pronunciation.</p>}
      {error && <p role="alert" className="text-rose-700">{error}</p>}
    </section>}
    {(feedback.soundTips?.length ?? 0) > 0 && <details className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <summary className="cursor-pointer font-semibold">Practise these sounds</summary>
      <p className="my-2 text-xs text-stone-700">These words came from your transcript. We do not know how you pronounced them. Listen and compare for yourself; these practice recordings stay on this device.</p>
      <ul className="space-y-2">{feedback.soundTips?.slice(0, 2).map((tip) => <SoundPractice key={`${tip.word}:${tip.label}`} {...tip} />)}</ul>
    </details>}
  </div>;
}
