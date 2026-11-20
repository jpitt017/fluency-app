'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Mic, RotateCcw, Sparkles, Square, Volume2 } from 'lucide-react';
import { speakPhrase } from '@/lib/b1b2/speech';
import { createClient } from '@/utils/supabase/client';
import type { SpeakingTask, WritingTask } from '@/lib/b1b2/types';

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface PronunciationNote {
  target: string;
  issue: string;
  tip: string;
}

interface SpeakingEvalResult {
  attemptId?: string | null;
  transcript: string;
  improvedResponse: string;
  feedback: string;
  strengths: string[];
  improvements: string[];
  pronunciationNotes?: PronunciationNote[];
  tips?: string[];
  rubric: {
    fluency: number;
    lexical_range: number;
    grammar_accuracy: number;
    coherence: number;
    pronunciation: number;
  };
  score: number;
  newBadges?: string[];
}

interface WritingEvalResult {
  submissionId?: string | null;
  corrected: string;
  feedback: string;
  notes: string[];
  corrections: { original: string; alternative: string; reason: string; rule?: string }[];
  rubric: {
    task_response: number;
    organisation: number;
    grammar_accuracy: number;
    lexical_range: number;
    style: number;
  };
  score: number;
  newBadges?: string[];
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
  const [variety, setVariety] = useState<'British' | 'American' | 'International'>('International');
  const [busy, setBusy] = useState<'speaking' | 'writing' | null>(null);

  const [speakingResult, setSpeakingResult] = useState<SpeakingEvalResult | null>(null);
  const [prevSpeakingScore, setPrevSpeakingScore] = useState<number | null>(null);

  const [writingResult, setWritingResult] = useState<WritingEvalResult | null>(null);
  const [prevWritingScore, setPrevWritingScore] = useState<number | null>(null);
  const [revisedFromId, setRevisedFromId] = useState<string | null>(null);

  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const supabase = createClient();

  async function startRecording() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
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

    if (speakingResult) {
      setPrevSpeakingScore(speakingResult.score);
    }

    setBusy('speaking');
    setError('');
    setSpeakingResult(null);

    try {
      let audioPath = '';
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

      const targetPhrase = [
        ...(speaking.target_terms ?? []),
        ...(speaking.target_linkers ?? []),
      ].join(', ');

      let res: Response;
      if (audioBlob && !transcript.trim()) {
        const form = new FormData();
        form.set('audio', audioBlob, `lesson-${lessonNumber}.webm`);
        form.set('prompt', speaking.prompt);
        form.set('targetPhrase', targetPhrase);
        form.set('taskId', speaking.id);
        form.set('lessonId', lessonId);
        form.set('durationSeconds', String(seconds || speaking.target_seconds));
        form.set('mimeType', audioBlob.type || 'audio/webm');
        if (audioPath) form.set('audioPath', audioPath);
        res = await fetch('/api/speaking/evaluate', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/speaking/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: transcript.trim(),
            prompt: speaking.prompt,
            targetPhrase,
            taskId: speaking.id,
            lessonId,
            durationSeconds: seconds || speaking.target_seconds,
            audioPath: audioPath || undefined,
            mimeType: audioBlob?.type || undefined,
          }),
        });
      }

      const data = (await res.json()) as SpeakingEvalResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not evaluate speaking response.');

      if (!transcript.trim() && data.transcript) {
        setTranscript(data.transcript);
      }
      setSpeakingResult(data);
      onSubmitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not evaluate speaking response.');
    } finally {
      setBusy(null);
    }
  }

  function retrySpeaking() {
    if (speakingResult) setPrevSpeakingScore(speakingResult.score);
    setAudioBlob(null);
    setAudioUrl(null);
    setSeconds(0);
    setTranscript('');
  }

  async function evaluateWriting() {
    if (!writing || !draft.trim()) {
      setError('Write a response before requesting rubric feedback.');
      return;
    }

    if (writingResult) {
      setPrevWritingScore(writingResult.score);
    }

    setBusy('writing');
    setError('');
    setWritingResult(null);

    try {
      const res = await fetch('/api/writing/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: draft.trim(),
          prompt: writing.prompt,
          targetKeywords: speaking?.target_terms ?? [],
          lessonId,
          taskId: writing.id,
          revisedFrom: revisedFromId || undefined,
          variety,
        }),
      });

      const data = (await res.json()) as WritingEvalResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not evaluate writing draft.');

      setWritingResult(data);
      if (data.submissionId) setRevisedFromId(data.submissionId);
      onSubmitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not evaluate writing draft.');
    } finally {
      setBusy(null);
    }
  }

  function reviseWriting() {
    if (writingResult) {
      setPrevWritingScore(writingResult.score);
      if (writingResult.submissionId) setRevisedFromId(writingResult.submissionId);
    }
    draftTextareaRef.current?.focus();
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

  const speakingDelta =
    speakingResult && prevSpeakingScore !== null ? speakingResult.score - prevSpeakingScore : null;
  const writingDelta =
    writingResult && prevWritingScore !== null ? writingResult.score - prevWritingScore : null;

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
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 transition hover:bg-stone-50"
              >
                <Mic className="h-3.5 w-3.5 text-rose-700" />
                <span>{audioBlob ? 'Re-record mic' : 'Record mic'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex animate-pulse items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop ({seconds}s)</span>
              </button>
            )}
            {audioUrl && <audio controls src={audioUrl} className="h-8 max-w-full" />}
          </div>

          <label className="mt-3 block text-xs font-semibold text-stone-600">
            Spoken transcript (optional when mic recording is attached — Whisper transcribes automatically)
            <textarea
              rows={3}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Record with your mic above or type your spoken answer here…"
              className="mt-1.5 w-full rounded-xl border border-stone-300 bg-stone-50/50 p-3 text-sm text-stone-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-stone-500">
              {audioBlob && !transcript.trim() ? `Audio recorded (${seconds}s)` : `${wordCount(transcript)} words in transcript`}
            </span>
            <button
              type="button"
              disabled={busy === 'speaking' || (!transcript.trim() && !audioBlob)}
              onClick={evaluateSpeaking}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-800 disabled:bg-stone-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{busy === 'speaking' ? 'Transcribing & scoring…' : 'Evaluate speaking'}</span>
            </button>
          </div>

          {speakingResult && (
            <div className="mt-4 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-indigo-700 px-2.5 py-1 text-xs font-bold text-white">
                    {speakingResult.score} / 100
                  </span>
                  {speakingDelta !== null && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        speakingDelta >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {speakingDelta >= 0 ? `+${speakingDelta}` : speakingDelta} vs previous attempt
                    </span>
                  )}
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-indigo-800 ring-1 ring-indigo-200">
                    {speakingResult.score >= 80 ? 'B2 Ready' : speakingResult.score >= 65 ? 'B1+ Developing' : 'B1 Building'}
                  </span>
                  {speakingResult.newBadges?.map((b) => (
                    <span key={b} className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                      Badge unlocked: {b}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={retrySpeaking}
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Retry &amp; improve score</span>
                </button>
              </div>

              <p className="text-sm text-stone-800">{speakingResult.feedback}</p>

              {speakingResult.rubric && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ['Fluency', speakingResult.rubric.fluency],
                    ['Lexis', speakingResult.rubric.lexical_range],
                    ['Grammar', speakingResult.rubric.grammar_accuracy],
                    ['Coherence', speakingResult.rubric.coherence],
                    ['Pronunc.', speakingResult.rubric.pronunciation],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="rounded-lg bg-white p-2 text-center ring-1 ring-stone-200">
                      <p className="text-[11px] font-semibold uppercase text-stone-500">{label}</p>
                      <p className="text-sm font-bold text-stone-900">{val}/5</p>
                    </div>
                  ))}
                </div>
              )}

              {speakingResult.pronunciationNotes && speakingResult.pronunciationNotes.length > 0 && (
                <div className="space-y-1.5 rounded-lg bg-white p-3 text-xs text-stone-700 ring-1 ring-stone-200">
                  <p className="font-bold uppercase tracking-wide text-indigo-800">
                    Pronunciation, sound &amp; stress diagnostics
                  </p>
                  {speakingResult.pronunciationNotes.map((note, idx) => (
                    <div key={idx} className="flex flex-wrap items-start justify-between gap-2 border-t border-stone-100 pt-2 first:border-t-0 first:pt-0">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-stone-900">
                          &ldquo;{note.target}&rdquo;{' '}
                          <span className="font-normal text-stone-500">— {note.issue}</span>
                        </p>
                        <p className="mt-0.5 text-stone-600">{note.tip}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void speakPhrase(note.target, 'en-GB', 0.85)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100"
                      >
                        <Volume2 className="h-3 w-3 text-indigo-700" />
                        <span>Hear model</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {speakingResult.strengths?.length > 0 && (
                <div className="rounded-lg bg-white p-3 text-xs text-stone-700 ring-1 ring-stone-200">
                  <p className="font-bold uppercase tracking-wide text-emerald-800">Strengths</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {speakingResult.strengths.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {speakingResult.improvements?.length > 0 && (
                <div className="rounded-lg bg-white p-3 text-xs text-stone-700 ring-1 ring-stone-200">
                  <p className="font-bold uppercase tracking-wide text-stone-600">Targeted upgrades</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {speakingResult.improvements.map((imp, idx) => (
                      <li key={idx}>{imp}</li>
                    ))}
                  </ul>
                </div>
              )}

              {speakingResult.improvedResponse && (
                <div className="rounded-lg border-l-4 border-indigo-400 bg-white p-3 text-xs leading-5 text-stone-700">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-indigo-900">B2 model upgrade</strong>
                    <button
                      type="button"
                      onClick={() => void speakPhrase(speakingResult.improvedResponse, 'en-GB', 0.95)}
                      className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100"
                    >
                      Listen to model
                    </button>
                  </div>
                  <p className="mt-1">{speakingResult.improvedResponse}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {writing && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-indigo-800">
              Writing · {writing.format}
            </span>
            <div role="group" aria-label="English variety for writing feedback" className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-[11px] font-semibold">
              {(['International', 'British', 'American'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVariety(v)}
                  className={`rounded-md px-2 py-0.5 ${variety === v ? 'bg-white text-indigo-700 shadow-2xs' : 'text-stone-600'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
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
            ref={draftTextareaRef}
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Draft your paragraph or structured response here…"
            className="mt-3 w-full rounded-xl border border-stone-300 bg-stone-50/50 p-3 text-sm text-stone-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-stone-500">
              {wordCount(draft)} words {revisedFromId ? '· Revising previous draft' : ''}
            </span>
            <button
              type="button"
              disabled={busy === 'writing' || !draft.trim()}
              onClick={evaluateWriting}
              className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-800 disabled:bg-stone-300"
            >
              {busy === 'writing' ? 'Evaluating rubric…' : revisedFromId ? 'Re-evaluate revision' : 'Evaluate writing'}
            </button>
          </div>

          {writingResult && (
            <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white">
                    {writingResult.score} / 100
                  </span>
                  {writingDelta !== null && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        writingDelta >= 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {writingDelta >= 0 ? `+${writingDelta}` : writingDelta} vs previous draft
                    </span>
                  )}
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                    {writingResult.score >= 80 ? 'B2 Ready' : writingResult.score >= 65 ? 'B1+ Developing' : 'B1 Building'}
                  </span>
                  {writingResult.newBadges?.map((b) => (
                    <span key={b} className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                      Badge unlocked: {b}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={reviseWriting}
                  className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  Revise &amp; resubmit
                </button>
              </div>

              <p className="text-sm text-stone-800">{writingResult.feedback}</p>

              {writingResult.rubric && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ['Task', writingResult.rubric.task_response],
                    ['Organisation', writingResult.rubric.organisation],
                    ['Grammar', writingResult.rubric.grammar_accuracy],
                    ['Lexis', writingResult.rubric.lexical_range],
                    ['Style', writingResult.rubric.style],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="rounded-lg bg-white p-2 text-center ring-1 ring-stone-200">
                      <p className="text-[11px] font-semibold uppercase text-stone-500">{label}</p>
                      <p className="text-sm font-bold text-stone-900">{val}/5</p>
                    </div>
                  ))}
                </div>
              )}

              {writingResult.corrections?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-stone-600">Line-by-line edits &amp; patterns</p>
                  {writingResult.corrections.map((c, idx) => (
                    <div key={idx} className="rounded-lg bg-white p-2.5 text-xs text-stone-700 ring-1 ring-stone-200">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p>
                          <span className="line-through text-rose-700">{c.original}</span> →{' '}
                          <span className="font-semibold text-emerald-800">{c.alternative}</span>
                        </p>
                        {c.rule && (
                          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                            {c.rule}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-stone-500">{c.reason}</p>
                    </div>
                  ))}
                </div>
              )}

              {writingResult.notes?.length > 0 && (
                <ul className="list-disc space-y-1 pl-4 text-xs text-stone-700">
                  {writingResult.notes.map((n, idx) => (
                    <li key={idx}>{n}</li>
                  ))}
                </ul>
              )}

              {writingResult.corrected && (
                <div className="rounded-lg border-l-4 border-emerald-500 bg-white p-3 text-xs leading-5 text-stone-700">
                  <strong className="block text-emerald-900">B2 model rewrite</strong>
                  {writingResult.corrected}
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
