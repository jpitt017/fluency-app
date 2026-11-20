'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { SpeakingTask, WritingTask } from '@/lib/b1b2/types';

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface SpeakingEvalResult {
  overallScore: number;
  cefrEstimate: string;
  criteria: {
    taskAchievement: number;
    coherenceCohesion: number;
    lexicalResource: number;
    grammarAccuracy: number;
    pronunciationFluency: number;
  };
  summary: string;
  strengths: string[];
  corrections: { original: string; improved: string; reason: string }[];
  b2Upgrade: string;
  xpGranted?: number;
}

interface WritingEvalResult {
  overallScore: number;
  cefrEstimate: string;
  criteria: {
    taskAchievement: number;
    coherenceCohesion: number;
    lexicalResource: number;
    grammarAccuracy: number;
    registerTone: number;
  };
  summary: string;
  strengths: string[];
  corrections: { original: string; corrected: string; reason: string }[];
  upgradedParagraph: string;
  xpGranted?: number;
}

export default function OutputStudio({
  lessonId,
  lessonNumber,
  signedIn,
  speaking,
  writing,
  onSubmitted,
}: {
  lessonId: string;
  lessonNumber: number;
  signedIn: boolean;
  speaking: SpeakingTask | null;
  writing: WritingTask | null;
  onSubmitted: () => void;
}) {
  const [transcript, setTranscript] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'speaking' | 'writing' | null>(null);
  const [speakingResult, setSpeakingResult] = useState<SpeakingEvalResult | null>(null);
  const [writingResult, setWritingResult] = useState<WritingEvalResult | null>(null);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const supabase = createClient();

  async function startRecording() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError('Microphone permission is unavailable here — you can still type or paste your spoken response below for rubric evaluation.');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function evaluateSpeaking() {
    if (!speaking) return;
    if (!transcript.trim() && !audioBlob) {
      setError('Record audio or write your spoken response transcript before evaluating.');
      return;
    }

    setBusy('speaking');
    setError('');
    setSpeakingResult(null);

    try {
      let audioPath: string | null = null;
      if (audioBlob) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const path = `${user.id}/lesson-${lessonNumber}-${Date.now()}.webm`;
          const { error: uploadError } = await supabase.storage
            .from('speaking-recordings')
            .upload(path, audioBlob, { contentType: audioBlob.type || 'audio/webm', upsert: false });
          if (!uploadError) {
            audioPath = path;
          }
        }
      }

      const textToEvaluate =
        transcript.trim() ||
        `[Audio recording submitted (${Math.max(seconds, 1)}s) for task: ${speaking.prompt}]`;

      const res = await fetch('/api/speaking/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: textToEvaluate,
          prompt: speaking.prompt,
          targetWords: speaking.target_terms ?? [],
          lessonId,
          speakingTaskId: speaking.id,
          durationSeconds: seconds || speaking.target_seconds,
          audioPath,
          wordCount: wordCount(textToEvaluate),
          persist: true,
        }),
      });

      const data = (await res.json()) as SpeakingEvalResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not evaluate speaking response.');

      setSpeakingResult(data);
      onSubmitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not evaluate speaking response.');
    } finally {
      setBusy(null);
    }
  }

  async function evaluateWriting() {
    if (!writing || !draft.trim()) {
      setError('Write a response before requesting rubric feedback.');
      return;
    }

    setBusy('writing');
    setError('');
    setWritingResult(null);

    try {
      const res = await fetch('/api/writing/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: draft.trim(),
          prompt: writing.prompt,
          targetWords: speaking?.target_terms ?? [],
          lessonId,
          writingTaskId: writing.id,
          wordCount: wordCount(draft),
          persist: true,
        }),
      });

      const data = (await res.json()) as WritingEvalResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not evaluate writing draft.');

      setWritingResult(data);
      onSubmitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not evaluate writing draft.');
    } finally {
      setBusy(null);
    }
  }

  if (!signedIn) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
        <p>Sign in to record speaking responses, submit writing drafts, and unlock live B1 → B2 rubric feedback.</p>
        <Link
          href={`/login?next=/curriculum/lessons/${lessonNumber}`}
          className="mt-3 inline-block rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
        >
          Sign in to practise output
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {speaking && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-800">
            Speaking · {speaking.kind}
          </span>
          <h3 className="mt-1.5 text-sm font-bold text-stone-900">{speaking.title}</h3>
          <p className="mt-2 text-sm text-stone-700">{speaking.prompt}</p>
          <p className="mt-1 text-xs text-stone-500">
            Target length: ~{speaking.target_seconds}s
            {speaking.target_terms?.length ? ` · Target vocabulary: ${speaking.target_terms.join(', ')}` : ''}
          </p>

          {speaking.useful_phrases?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {speaking.useful_phrases.map((phrase) => (
                <span key={phrase} className="rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-700">
                  {phrase}
                </span>
              ))}
            </div>
          ) : null}

          {speaking.target_linkers?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {speaking.target_linkers.map((linker) => (
                <span key={linker} className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
                  {linker}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 transition hover:bg-stone-50"
              >
                {audioBlob ? 'Re-record mic' : 'Record mic'}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800"
              >
                Stop ({seconds}s)
              </button>
            )}
            {audioUrl && <audio controls src={audioUrl} className="h-8 max-w-full" />}
          </div>

          <label className="mt-3 block text-xs font-semibold text-stone-600">
            Spoken transcript (type or edit what you said for rubric scoring)
            <textarea
              rows={3}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Write or transcribe your spoken answer here…"
              className="mt-1.5 w-full rounded-xl border border-stone-300 bg-stone-50/50 p-3 text-sm text-stone-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-stone-500">{wordCount(transcript)} words in transcript</span>
            <button
              type="button"
              disabled={busy === 'speaking' || (!transcript.trim() && !audioBlob)}
              onClick={evaluateSpeaking}
              className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-800 disabled:bg-stone-300"
            >
              {busy === 'speaking' ? 'Evaluating rubric…' : 'Evaluate speaking'}
            </button>
          </div>

          {speakingResult && (
            <div className="mt-4 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-indigo-700 px-2.5 py-1 text-xs font-bold text-white">
                    {speakingResult.overallScore} / 100
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-indigo-800 ring-1 ring-indigo-200">
                    CEFR {speakingResult.cefrEstimate}
                  </span>
                  {speakingResult.xpGranted ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      +{speakingResult.xpGranted} XP
                    </span>
                  ) : null}
                </div>
                <span className="text-xs font-semibold text-emerald-800">Saved &amp; evaluated</span>
              </div>

              <p className="text-sm text-stone-800">{speakingResult.summary}</p>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ['Task', speakingResult.criteria.taskAchievement],
                  ['Coherence', speakingResult.criteria.coherenceCohesion],
                  ['Lexis', speakingResult.criteria.lexicalResource],
                  ['Grammar', speakingResult.criteria.grammarAccuracy],
                  ['Fluency', speakingResult.criteria.pronunciationFluency],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-lg bg-white p-2 text-center ring-1 ring-stone-200">
                    <p className="text-[11px] font-semibold uppercase text-stone-500">{label}</p>
                    <p className="text-sm font-bold text-stone-900">{val}/20</p>
                  </div>
                ))}
              </div>

              {speakingResult.corrections?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-stone-600">Targeted upgrades</p>
                  {speakingResult.corrections.map((c, idx) => (
                    <div key={idx} className="rounded-lg bg-white p-2.5 text-xs text-stone-700 ring-1 ring-stone-200">
                      <p>
                        <span className="line-through text-rose-700">{c.original}</span> →{' '}
                        <span className="font-semibold text-emerald-800">{c.improved}</span>
                      </p>
                      <p className="mt-0.5 text-stone-500">{c.reason}</p>
                    </div>
                  ))}
                </div>
              )}

              {speakingResult.b2Upgrade && (
                <div className="rounded-lg border-l-4 border-indigo-400 bg-white p-3 text-xs leading-5 text-stone-700">
                  <strong className="block text-indigo-900">B2 model upgrade</strong>
                  {speakingResult.b2Upgrade}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {writing && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-indigo-800">
            Writing · {writing.format}
          </span>
          <h3 className="mt-1.5 text-sm font-bold text-stone-900">{writing.title}</h3>
          <p className="mt-2 text-sm text-stone-700">{writing.prompt}</p>
          <p className="mt-1 text-xs text-stone-500">
            Target {writing.word_min}–{writing.word_max} words
          </p>

          {writing.outline && Object.keys(writing.outline).length > 0 && (
            <div className="mt-3 rounded-lg bg-stone-50 p-3 text-xs text-stone-700">
              <p className="font-semibold uppercase tracking-wide text-stone-500">Suggested outline</p>
              <ul className="mt-1.5 space-y-1">
                {Object.entries(writing.outline).map(([part, hint]) => (
                  <li key={part}>
                    <strong className="capitalize text-stone-800">{part.replace(/_/g, ' ')}:</strong> {hint}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <textarea
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Draft your paragraph or structured response here…"
            className="mt-3 w-full rounded-xl border border-stone-300 bg-stone-50/50 p-3 text-sm text-stone-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-stone-500">{wordCount(draft)} words</span>
            <button
              type="button"
              disabled={busy === 'writing' || !draft.trim()}
              onClick={evaluateWriting}
              className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-800 disabled:bg-stone-300"
            >
              {busy === 'writing' ? 'Evaluating rubric…' : 'Evaluate writing'}
            </button>
          </div>

          {writingResult && (
            <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white">
                    {writingResult.overallScore} / 100
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                    CEFR {writingResult.cefrEstimate}
                  </span>
                  {writingResult.xpGranted ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      +{writingResult.xpGranted} XP
                    </span>
                  ) : null}
                </div>
                <span className="text-xs font-semibold text-emerald-800">Saved &amp; evaluated</span>
              </div>

              <p className="text-sm text-stone-800">{writingResult.summary}</p>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ['Task', writingResult.criteria.taskAchievement],
                  ['Coherence', writingResult.criteria.coherenceCohesion],
                  ['Lexis', writingResult.criteria.lexicalResource],
                  ['Grammar', writingResult.criteria.grammarAccuracy],
                  ['Register', writingResult.criteria.registerTone],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-lg bg-white p-2 text-center ring-1 ring-stone-200">
                    <p className="text-[11px] font-semibold uppercase text-stone-500">{label}</p>
                    <p className="text-sm font-bold text-stone-900">{val}/20</p>
                  </div>
                ))}
              </div>

              {writingResult.corrections?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-stone-600">Line-by-line edits</p>
                  {writingResult.corrections.map((c, idx) => (
                    <div key={idx} className="rounded-lg bg-white p-2.5 text-xs text-stone-700 ring-1 ring-stone-200">
                      <p>
                        <span className="line-through text-rose-700">{c.original}</span> →{' '}
                        <span className="font-semibold text-emerald-800">{c.corrected}</span>
                      </p>
                      <p className="mt-0.5 text-stone-500">{c.reason}</p>
                    </div>
                  ))}
                </div>
              )}

              {writingResult.upgradedParagraph && (
                <div className="rounded-lg border-l-4 border-emerald-500 bg-white p-3 text-xs leading-5 text-stone-700">
                  <strong className="block text-emerald-900">B2 model rewrite</strong>
                  {writingResult.upgradedParagraph}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-amber-50 p-2.5 text-xs font-medium text-amber-800">{error}</p>}
    </div>
  );
}
