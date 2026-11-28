'use client';

import { useEffect, useRef, useState } from 'react';
import { speakPhrase } from '@/lib/b1b2/speech';
import {
  structureUsed,
  type ShortSpeakingFeedback,
  type StructurePoint,
} from '@/lib/b1b2/speaking-feedback.mjs';
import ImprovedAnswerCard from './ImprovedAnswerCard';

type PracticeResult = { transcript: string; used: boolean };
type PracticeState = {
  id: string;
  status: string;
  transcript: string | null;
  used: boolean | null;
} | null;

const SPEAKING_AREAS_META = [
  {
    key: 'grammar_and_vocabulary' as const,
    label: 'Grammar and vocabulary',
    question: 'Did you use clear grammar and the right words?',
    emptyBadge: 'Not marked',
  },
  {
    key: 'discourse_management' as const,
    label: 'Discourse management',
    question: 'Did you speak for long enough and link your ideas?',
    emptyBadge: 'Not marked',
  },
  {
    key: 'pronunciation' as const,
    label: 'Pronunciation',
    question: 'Could people understand you easily?',
    emptyBadge: 'Teacher only',
  },
  {
    key: 'interactive_communication' as const,
    label: 'Interactive communication',
    question: 'Did you answer your partner and keep the talk going?',
    emptyBadge: 'Discuss & decide only',
  },
];

/** One browser recording. Nothing leaves the device until onRecorded is called. */
export function RecordButton({
  label,
  disabled,
  onRecorded,
}: {
  label: string;
  disabled?: boolean;
  onRecorded: (blob: Blob) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const startingRef = useRef(false);
  const recorded = useRef(onRecorded);
  useEffect(() => {
    recorded.current = onRecorded;
  }, [onRecorded]);
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
    if (startingRef.current || recorder.current?.state === 'recording') return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Audio recording is not supported in this browser.');
      return;
    }
    startingRef.current = true;
    setStarting(true);
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        input.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = input;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const next = new MediaRecorder(input, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.current = next;
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      next.onstop = () => {
        input.getTracks().forEach((track) => track.stop());
        if (stream.current === input) stream.current = null;
        if (recorder.current === next) recorder.current = null;
        if (!mounted.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: next.mimeType || 'audio/webm' });
        if (blob.size) recorded.current(blob);
        else setError('No recording was made. Please try again.');
      };
      next.start();
      setRecording(true);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      recorder.current = null;
      if (mounted.current) {
        setError('Microphone access is unavailable. Check your browser permissions.');
      }
    } finally {
      startingRef.current = false;
      if (mounted.current) setStarting(false);
    }
  }
  return (
    <div className="space-y-1">
      {recording ? (
        <button
          type="button"
          onClick={() => recorder.current?.stop()}
          className="min-h-11 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
        >
          Stop recording
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled || starting}
          onClick={() => void start()}
          className="min-h-11 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-50"
        >
          {starting ? 'Starting microphone…' : label}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

function SoundPractice({ word, label, tip }: { word: string; label: string; tip: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <li className="space-y-2 rounded-lg bg-white p-3">
      <p>
        <strong>{word}</strong> · {label}
      </p>
      <p>{tip}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void speakPhrase(word, 'en-GB')}
          className="min-h-11 rounded-lg border border-stone-300 px-3 py-2 font-semibold"
        >
          Listen to {word}
        </button>
        <RecordButton
          label={`Record ${word}`}
          onRecorded={(blob) => setUrl(URL.createObjectURL(blob))}
        />
      </div>
      {url && (
        <audio
          controls
          src={url}
          aria-label={`Your recording of ${word}`}
          className="max-w-full"
        />
      )}
    </li>
  );
}

async function transcribePractice(blob: Blob, point: StructurePoint): Promise<PracticeResult> {
  const form = new FormData();
  form.set('audio', blob, 'sentence.webm');
  const response = await fetch('/api/speaking/transcribe', { method: 'POST', body: form });
  const data = (await response.json()) as { transcript?: string; error?: string };
  if (!response.ok || !data.transcript) {
    throw new Error(data.error || 'We could not check this sentence.');
  }
  return { transcript: data.transcript, used: structureUsed(data.transcript, point.structure) };
}

export default function SpeakingFeedbackDetails({
  feedback,
  practice = null,
  onPractice,
  onRecheckPractice,
  practiceAllowed = true,
  practiceUnavailableMessage = 'No weekly checks remain for this extra practice.',
  showImprovedInline = false,
  ttsKind,
  ttsId,
}: {
  feedback: ShortSpeakingFeedback;
  practice?: PracticeState;
  onPractice?: (blob: Blob) => Promise<PracticeResult>;
  onRecheckPractice?: (takeId: string) => Promise<PracticeResult>;
  practiceAllowed?: boolean;
  practiceUnavailableMessage?: string;
  showImprovedInline?: boolean;
  ttsKind?: 'attempt' | 'take';
  ttsId?: string | null;
}) {
  const [localResult, setLocalResult] = useState<PracticeResult | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const point = feedback.structure;
  const savedResult =
    practice?.status === 'checked' && practice.transcript && typeof practice.used === 'boolean'
      ? { transcript: practice.transcript, used: practice.used }
      : null;
  const result = localResult ?? savedResult;

  async function run(blob: Blob) {
    if (!point) return;
    setAttempted(true);
    setBusy(true);
    setError('');
    try {
      setLocalResult(await (onPractice ? onPractice(blob) : transcribePractice(blob, point)));
    } catch (cause) {
      setAttempted(false);
      setError(cause instanceof Error ? cause.message : 'We could not check this sentence.');
    } finally {
      setBusy(false);
    }
  }

  async function recheck() {
    if (!practice || !onRecheckPractice) return;
    setBusy(true);
    setError('');
    try {
      setLocalResult(await onRecheckPractice(practice.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not check this sentence.');
    } finally {
      setBusy(false);
    }
  }

  const f = feedback.fluency;
  const areas = feedback.areas;
  const teacherMarks = feedback.teacherAreaMarks;

  return (
    <div className="space-y-4 text-sm">
      {feedback.transcript && (
        <div>
          <p className="text-xs font-bold uppercase text-stone-500">Your transcript</p>
          <p className="mt-1 whitespace-pre-line">{feedback.transcript}</p>
        </div>
      )}

      {(areas || teacherMarks) && (
        <section aria-label="Speaking feedback by area" className="space-y-2.5">
          <p className="text-xs font-bold uppercase text-stone-500">
            Speaking areas (0–5 where marked)
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {SPEAKING_AREAS_META.map((meta) => {
              const aiItem = areas ? areas[meta.key] : null;
              const teacherOverride = teacherMarks?.[meta.key];
              const effectiveScore =
                typeof teacherOverride === 'number'
                  ? teacherOverride
                  : typeof aiItem?.score === 'number'
                    ? aiItem.score
                    : null;
              return (
                <div
                  key={meta.key}
                  className="space-y-1.5 rounded-lg border border-stone-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-stone-900">{meta.label}</span>
                    {effectiveScore !== null ? (
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
                        {effectiveScore} / 5
                        {typeof teacherOverride === 'number' ? ' · teacher' : ''}
                      </span>
                    ) : (
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
                        {meta.emptyBadge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500">{meta.question}</p>
                  {aiItem && (
                    <>
                      <p className="text-xs text-emerald-900">
                        <strong>Good:</strong> {aiItem.strength}
                      </p>
                      <p className="text-xs text-stone-700">
                        <strong>Next step:</strong> {aiItem.improvement}
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(feedback.cueChecklist?.length ?? 0) > 0 && (
        <section
          aria-label="Cue points checklist"
          className="space-y-2 rounded-lg border border-stone-200 bg-white p-3"
        >
          <p className="text-xs font-bold uppercase text-stone-500">
            Cue points covered (checklist)
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {feedback.cueChecklist?.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-xs text-stone-800">
                <span
                  aria-hidden="true"
                  className={`font-bold ${item.covered ? 'text-emerald-700' : 'text-stone-400'}`}
                >
                  {item.covered ? '✓' : '✗'}
                </span>
                <span>
                  {item.label}{' '}
                  <span className="sr-only">{item.covered ? 'covered' : 'not yet covered'}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(feedback.usedHighlights?.length ?? 0) > 0 && (
        <section
          aria-label="Highlighted structures used"
          className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3"
        >
          <p className="text-xs font-bold uppercase text-indigo-900">
            Structures from your improved answer
          </p>
          <ul className="space-y-1 text-xs">
            {feedback.usedHighlights?.map((item) => (
              <li key={item.substring} className="flex items-center gap-2 text-stone-800">
                <span
                  aria-hidden="true"
                  className={`font-bold ${item.used ? 'text-emerald-700' : 'text-stone-400'}`}
                >
                  {item.used ? '✓' : '✗'}
                </span>
                <span>
                  <strong>{item.label}:</strong> &ldquo;{item.substring}&rdquo; (
                  {item.used ? 'used in this try' : 'not found in this try'})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showImprovedInline && feedback.improvedResponse && (
        <ImprovedAnswerCard
          improvedResponse={feedback.improvedResponse}
          highlights={feedback.highlights ?? []}
          ttsKind={ttsKind}
          ttsId={ttsId}
        />
      )}

      {f && (
        <div className="rounded-lg bg-sky-50 p-3" aria-label="Fluency information">
          <p className="font-semibold">Fluency</p>
          <p>
            {f.wordsPerMinute === null
              ? 'Speaking speed is not available.'
              : `About ${f.wordsPerMinute} words a minute.`}{' '}
            {f.pauses === null
              ? 'Pause information is not available.'
              : `${f.pauses} ${f.pauses === 1 ? 'pause' : 'pauses'} over one second between speech sections.`}
          </p>
          <p className="mt-1 text-xs text-stone-600">
            Only gaps between transcript sections are counted. Speed and pauses do not change your marks.
          </p>
        </div>
      )}

      {point && (
        <section
          className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3"
          aria-label="Build a better sentence"
        >
          <h4 className="font-semibold">Build a better sentence</h4>
          <p>
            <span className="font-medium">You said:</span> {point.original}
          </p>
          <p>
            <span className="font-medium">Try:</span> {point.upgraded}
          </p>
          <p>{point.explanation}</p>
          {!result && !practice && (
            <RecordButton
              label={busy ? 'Checking…' : 'Say it again'}
              disabled={busy || attempted || !practiceAllowed}
              onRecorded={(blob) => void run(blob)}
            />
          )}
          {!practiceAllowed && !result && (
            <p className="text-xs text-stone-600">{practiceUnavailableMessage}</p>
          )}
          {practice && ['ready', 'checking'].includes(practice.status) && onRecheckPractice && (
            <button
              type="button"
              disabled={busy || !practiceAllowed}
              onClick={() => void recheck()}
              className="min-h-11 rounded-lg border border-indigo-300 bg-white px-3 py-2 font-semibold disabled:opacity-50"
            >
              {busy ? 'Checking…' : 'Check this saved sentence again'}
            </button>
          )}
          {result && (
            <p role="status" className="rounded-lg bg-white p-2">
              {result.used
                ? `We found ${point.structure} in your transcript.`
                : `We could not find ${point.structure} in your transcript.`}{' '}
              This checks the pattern, not all your grammar or pronunciation.
            </p>
          )}
          {error && (
            <p role="alert" className="text-rose-700">
              {error}
            </p>
          )}
        </section>
      )}

      {(feedback.soundTips?.length ?? 0) > 0 && (
        <details className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <summary className="cursor-pointer font-semibold">Practise these sounds</summary>
          <p className="my-2 text-xs text-stone-700">
            These words came from your transcript. We do not know how you pronounced them. Listen and compare for yourself; these practice recordings stay on this device.
          </p>
          <ul className="space-y-2">
            {feedback.soundTips?.slice(0, 2).map((tip) => (
              <SoundPractice key={`${tip.word}:${tip.label}`} {...tip} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
