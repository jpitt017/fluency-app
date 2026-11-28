'use client';

import { useEffect, useRef, useState } from 'react';
import type { LessonLabContext } from './LessonLabContext';
import SpeakingFeedbackDetails from '@/components/b1b2/SpeakingFeedbackDetails';
import type { ShortSpeakingFeedback } from '@/lib/b1b2/speaking-feedback.mjs';

interface SpeakingFeedback extends ShortSpeakingFeedback {
  attemptId?: string | null;
  transcript?: string;
  improvedResponse?: string;
  feedback?: string;
  tips?: string[];
  transcriptionNote?: string;
  passed?: boolean;
  modelAnswer?: string | null;
  weekRecorded?: boolean | null;
}

interface SpeakingLabProps {
  sessionTitle?: string;
  speakingFocus?: string;
  pronunciationFocus?: string;
  keyLanguage?: string[];
  lessonContext?: LessonLabContext;
  unlockedModel?: string | null;
  grammarWeek?: number;
  partType?: 'questions_about_you' | 'long_turn' | 'follow_up';
  recordButtonLabel?: string;
}

export default function SpeakingLab({
  speakingFocus,
  pronunciationFocus,
  keyLanguage = [],
  lessonContext,
  unlockedModel = null,
  grammarWeek,
  partType,
  recordButtonLabel = 'Start recording',
}: SpeakingLabProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const startingRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const languages = lessonContext?.targetVocabulary ?? keyLanguage;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      const audio = audioContextRef.current;
      if (audio && audio.state !== 'closed') void audio.close();
      audioContextRef.current = null;
    };
  }, []);

  function drawVisualizer(analyser: AnalyserNode) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      context.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width / data.length;
      data.forEach((value, index) => {
        context.fillStyle = '#059669';
        context.fillRect(
          index * width,
          canvas.height - (value / 255) * canvas.height,
          Math.max(1, width - 1),
          (value / 255) * canvas.height,
        );
      });
    };
    draw();
  }

  function stopVisualizer() {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    const context = audioContextRef.current;
    if (context && context.state !== 'closed') void context.close();
    audioContextRef.current = null;
  }

  async function evaluateAudio(blob: Blob) {
    setIsAnalyzing(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('audio', blob, 'lesson-recording.webm');
      if (lessonContext?.weekNumber) form.set('weekNumber', String(lessonContext.weekNumber));
      if (grammarWeek) form.set('grammarWeek', String(grammarWeek));
      if (partType) form.set('partType', partType);
      form.set(
        'prompt',
        lessonContext?.prompt ?? speakingFocus ?? 'General B1 → B2 English speaking practice',
      );
      form.set('targetPhrase', [...(lessonContext?.targetGrammar ?? []), ...languages].join(', '));
      const response = await fetch('/api/speaking/evaluate', { method: 'POST', body: form });
      const data = (await response.json().catch(() => null)) as
        | (SpeakingFeedback & { error?: string })
        | null;
      if (!response.ok || !data) {
        console.error('[speaking] evaluation failed:', data?.error ?? response.status);
        setError(data?.error || 'We could not check your work. Please try again.');
        return;
      }
      setFeedback(data);
      lessonContext?.onComplete?.({ transcript: data.transcript, passed: data.passed });
    } catch (caught) {
      console.error('[speaking] evaluation failed:', caught);
      setError('We could not check your work. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function startRecording() {
    if (startingRef.current || mediaRecorderRef.current?.state === 'recording') return;
    setError(null);
    setFeedback(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(
        'Audio recording is not supported in this browser. Try a current desktop or mobile browser.',
      );
      return;
    }
    startingRef.current = true;
    setIsStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const audio = new AudioContext();
      audioContextRef.current = audio;
      const analyser = audio.createAnalyser();
      analyser.fftSize = 64;
      audio.createMediaStreamSource(stream).connect(analyser);
      drawVisualizer(analyser);
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        if (mediaRecorderRef.current === recorder) mediaRecorderRef.current = null;
        stopVisualizer();
        if (!mountedRef.current) return;
        await evaluateAudio(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.start();
      setIsRecording(true);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      mediaRecorderRef.current = null;
      if (mountedRef.current) {
        setError('Microphone access denied or unavailable. Check your browser permissions.');
      }
      stopVisualizer();
    } finally {
      startingRef.current = false;
      if (mountedRef.current) setIsStarting(false);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      setIsAnalyzing(true);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  const exampleText = feedback?.modelAnswer || unlockedModel;
  const showExampleFirst = Boolean(feedback?.showExampleFirst && exampleText);

  return (
    <div className="space-y-4">
      {(lessonContext?.prompt || speakingFocus || languages.length > 0) && (
        <div className="space-y-2 rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Speaking &amp; fluency focus
          </p>
          {lessonContext?.prompt && <p className="text-sm text-stone-800">{lessonContext.prompt}</p>}
          {speakingFocus && (
            <p className="text-xs text-stone-700">
              <strong>Fluency:</strong> {speakingFocus}
            </p>
          )}
          {pronunciationFocus && (
            <p className="text-xs text-emerald-900">
              <strong>Pronunciation tip:</strong> {pronunciationFocus}
            </p>
          )}
          <p className="text-[11px] text-emerald-900/80">
            The AI reads what you said and checks your ideas, grammar and words. Pronunciation is marked by your teacher; to practise sounds, use Pronunciation practice.
          </p>
          {(lessonContext?.targetGrammar?.length ?? 0) > 0 && (
            <p className="text-xs text-stone-700">
              <strong>Target grammar:</strong> {lessonContext?.targetGrammar?.join(' · ')}
            </p>
          )}
          {languages.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {languages.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-xs text-emerald-900"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {lessonContext?.durationSeconds && (
        <p className="text-xs text-stone-500">
          Suggested speaking time: {lessonContext.durationSeconds} seconds.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {!isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={isAnalyzing || isStarting}
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
          >
            {isStarting
              ? 'Starting microphone…'
              : isAnalyzing
                ? 'Transcribing & analysing…'
                : recordButtonLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="animate-pulse rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Stop recording
          </button>
        )}
        <canvas
          ref={canvasRef}
          width={160}
          height={36}
          aria-label="Live audio waveform"
          className={`rounded-lg border border-stone-700 bg-stone-900 ${isRecording ? 'opacity-100' : 'opacity-40'}`}
        />
        {isRecording && (
          <span aria-live="polite" className="text-xs font-medium text-rose-600">
            Recording live…
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {exampleText && showExampleFirst && (
        <section className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <h3 className="font-semibold">Another example</h3>
          {feedback?.examplePromptMessage && (
            <p className="text-xs font-semibold text-amber-900">{feedback.examplePromptMessage}</p>
          )}
          <p className="whitespace-pre-line text-sm">{exampleText}</p>
        </section>
      )}

      {feedback && (
        <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
          {lessonContext?.weekNumber && feedback.weekRecorded === true && (
            <p role="status" className="font-semibold text-emerald-800">
              This counts for Week {lessonContext.weekNumber}.
            </p>
          )}
          {lessonContext?.weekNumber && feedback.weekRecorded === false && (
            <p role="alert" className="font-semibold text-rose-700">
              We could not count this for Week {lessonContext.weekNumber}. Please try again.
            </p>
          )}
          <SpeakingFeedbackDetails
            feedback={feedback}
            showImprovedInline
            ttsKind="attempt"
            ttsId={feedback.attemptId ?? null}
          />
        </div>
      )}

      {exampleText && !showExampleFirst && (
        <details className="rounded-xl border border-emerald-200 p-4">
          <summary className="cursor-pointer font-semibold">Another example</summary>
          <p className="mt-2 whitespace-pre-line text-sm">{exampleText}</p>
        </details>
      )}
    </div>
  );
}
