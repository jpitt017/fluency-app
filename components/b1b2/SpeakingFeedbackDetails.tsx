'use client';

import { useEffect, useRef, useState } from 'react';
import { speakPhrase } from '@/lib/b1b2/speech';
import type { ShortSpeakingFeedback } from '@/lib/b1b2/speaking-feedback.mjs';
import ImprovedAnswerCard from './ImprovedAnswerCard';

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

export default function SpeakingFeedbackDetails({
  feedback,
  showImprovedInline = false,
  ttsKind,
  ttsId,
}: {
  feedback: ShortSpeakingFeedback;
  showImprovedInline?: boolean;
  ttsKind?: 'attempt' | 'take';
  ttsId?: string | null;
}) {
  const areas = feedback.areas;
  const teacherMarks = feedback.teacherAreaMarks;
  const oneThingToTry =
    feedback.nextStep ||
    areas?.grammar_and_vocabulary?.improvement ||
    areas?.discourse_management?.improvement ||
    feedback.summary ||
    feedback.feedback ||
    '';

  return (
    <div className="space-y-3 text-sm">
      {/* 1. Your answer, improved */}
      {showImprovedInline && feedback.improvedResponse && (
        <ImprovedAnswerCard
          improvedResponse={feedback.improvedResponse}
          highlights={feedback.highlights ?? []}
          ttsKind={ttsKind}
          ttsId={ttsId}
        />
      )}

      {/* 2. One thing to try next time */}
      {oneThingToTry && (
        <section
          aria-label="One thing to try next time"
          className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5"
        >
          <h4 className="font-semibold text-emerald-950">One thing to try next time</h4>
          <p className="text-stone-800">{oneThingToTry}</p>
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
          <ul className="space-y-1 text-sm">
            {feedback.usedHighlights?.map((item) => (
              <li key={item.substring} className="flex items-center gap-2 text-stone-800">
                <span
                  aria-hidden="true"
                  className={`font-bold ${item.used ? 'text-emerald-700' : 'text-stone-500'}`}
                >
                  {item.used ? '✓' : '✗'}
                </span>
                <span>
                  <strong>{item.label}:</strong> &ldquo;{item.substring}&rdquo; (
                  {item.used ? 'used in this try' : 'not yet used'})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 3. Practise these sounds (folded, <= 2 common B1-B2 wordlist words) */}
      {(feedback.soundTips?.length ?? 0) > 0 && (
        <details className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <summary className="cursor-pointer font-semibold text-stone-900">
            Practise these sounds
          </summary>
          <ul className="mt-2 space-y-2">
            {feedback.soundTips?.slice(0, 2).map((tip) => (
              <SoundPractice key={`${tip.word}:${tip.label}`} {...tip} />
            ))}
          </ul>
        </details>
      )}

      {/* Folded transcript */}
      {feedback.transcript && (
        <details className="rounded-lg border border-stone-200 bg-white p-3">
          <summary className="cursor-pointer font-semibold text-stone-800">
            Your transcript
          </summary>
          <p className="mt-2 whitespace-pre-line text-stone-800">{feedback.transcript}</p>
        </details>
      )}

      {/* Folded area marks & cue checklist */}
      {(areas || teacherMarks || (feedback.cueChecklist?.length ?? 0) > 0) && (
        <details className="rounded-lg border border-stone-200 bg-white p-3">
          <summary className="cursor-pointer font-semibold text-stone-800">
            More detail on your speaking
          </summary>
          <div className="mt-3 space-y-3">
            {(areas || teacherMarks) && (
              <section aria-label="Speaking feedback by area" className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
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
                        className="space-y-1 rounded-lg border border-stone-200 bg-stone-50/70 p-2.5"
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
                        {aiItem && (
                          <>
                            <p className="text-emerald-900">
                              <strong>Good:</strong> {aiItem.strength}
                            </p>
                            <p className="text-stone-700">
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
              <section aria-label="Cue points checklist" className="space-y-1.5">
                <p className="text-xs font-bold uppercase text-stone-600">Cue points covered</p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {feedback.cueChecklist?.map((item) => (
                    <li key={item.label} className="flex items-center gap-2 text-stone-800">
                      <span
                        aria-hidden="true"
                        className={`font-bold ${item.covered ? 'text-emerald-700' : 'text-stone-500'}`}
                      >
                        {item.covered ? '✓' : '✗'}
                      </span>
                      <span>
                        {item.label}{' '}
                        <span className="sr-only">
                          {item.covered ? 'covered' : 'not yet covered'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
