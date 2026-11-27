'use client';

import { ACTION_BUTTON_CLASS } from '@/lib/curriculum/week-tasks.mjs';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SpeakingModelPlayer from './SpeakingModelPlayer';
import WeekSpeakingRecordings, { type WeekSpeakingRecordingLink } from './WeekSpeakingRecordings';
import { phrasesUsed, splitHighlightedText } from '@/lib/curriculum/speaking-support.mjs';

type Feedback = {
  transcript?: string;
  improvedResponse?: string;
  feedback?: string;
  tips?: string[];
  score?: number;
  weekRecorded?: boolean | null;
  supportSaved?: boolean;
  error?: string;
};
type Model = { text: string; audioUrl: string | null };
type Props = {
  week: number;
  prompt: string;
  cueCard: string;
  signedIn: boolean;
  planNotes: string[];
  usefulPhrases: string[];
  retryGoal: string;
  attemptId: string | null;
  initialNotes: { label: string; note: string }[] | null;
  firstTranscript: string | null;
  firstFeedback: Record<string, unknown> | null;
  secondTranscript: string | null;
  secondFeedback: Record<string, unknown> | null;
  recordings: WeekSpeakingRecordingLink[];
  model: Model | null;
};

function feedbackText(value: Record<string, unknown> | null): string | null {
  const summary = value?.summary;
  return typeof summary === 'string' ? summary : null;
}

function Transcript({ text, phrases }: { text: string; phrases: string[] }) {
  return <p className="whitespace-pre-line text-sm leading-7 text-stone-800">{splitHighlightedText(text, phrases).map((part, i) => part.highlighted
    ? <mark key={i} className="rounded bg-amber-200 px-0.5">{part.text}</mark>
    : <span key={i}>{part.text}</span>)}</p>;
}

export default function WeekSpeakingSupport(props: Props) {
  const {
    week, prompt, cueCard, signedIn, planNotes, usefulPhrases,
    retryGoal, initialNotes, firstTranscript: savedFirstTranscript,
  } = props;
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries((initialNotes ?? []).map((item) => [item.label, item.note])));
  const [attemptId, setAttemptId] = useState(props.attemptId);
  const [firstTranscript, setFirstTranscript] = useState(savedFirstTranscript);
  const [firstFeedback, setFirstFeedback] = useState<Feedback | null>(props.firstFeedback as Feedback | null);
  const [secondTranscript, setSecondTranscript] = useState(props.secondTranscript);
  const [secondFeedback, setSecondFeedback] = useState<Feedback | null>(props.secondFeedback as Feedback | null);
  const realPhrases = usefulPhrases;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const router = useRouter();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function evaluate(blob: Blob, takeNumber: 1 | 2) {
    setBusy(true);
    setError('');
    const id = attemptId ?? crypto.randomUUID();
    setAttemptId(id);
    const form = new FormData();
    form.set('audio', blob, `week-${week}-speaking-${takeNumber}.webm`);
    form.set('weekNumber', String(week));
    form.set('prompt', prompt);
    form.set('targetPhrase', realPhrases.join(', '));
    form.set('supportAttemptId', id);
    form.set('takeNumber', String(takeNumber));
    form.set('supportNotes', JSON.stringify(planNotes.map((label) => ({ label, note: notes[label] ?? '' }))));
    try {
      const response = await fetch('/api/speaking/evaluate', { method: 'POST', body: form });
      const data = await response.json() as Feedback & { modelAnswer?: string | null };
      if (!response.ok || !data) {
        setError(data.error || 'We could not check your recording. Please try again.');
        return;
      }
      if (takeNumber === 1) {
        setFirstFeedback(data);
        if (data.supportSaved) {
          setFirstTranscript(data.transcript ?? null);
          router.refresh();
        } else setFirstTranscript(null);
      } else if (data.supportSaved) {
        setSecondTranscript(data.transcript ?? null);
        setSecondFeedback(data);
        // Refresh the server projection so the second playback link appears.
        router.refresh();
      }
      if (data.supportSaved === false) setError('Your feedback is ready, but we could not save this attempt. Please try again.');
    } catch (caught) {
      console.error('[week-speaking] evaluation failed:', caught);
      setError('We could not check your recording. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function startRecording(takeNumber: 1 | 2) {
    setError('');
    if (!signedIn) return setError('Sign in to save your notes and recordings.');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return setError('Audio recording is not supported in this browser. Try a current desktop or mobile browser.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        void evaluate(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }), takeNumber);
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError('Microphone access denied or unavailable. Check your browser permissions.');
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  const unlockedModel = firstTranscript && props.model ? props.model : null;
  const usedOnRetry = secondTranscript ? phrasesUsed(secondTranscript, realPhrases) : [];
  const [scriptShown, setScriptShown] = useState(false);

  return <div className="space-y-5">
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Week {week} · speaking</p>
      <h3 id="week-speaking-title" className="mt-1 text-xl font-semibold">Plan, record and compare</h3>
      <p className="mt-2 text-sm leading-6 text-stone-700">{prompt}</p>
    </div>

    <section aria-labelledby="speaking-plan-title" className="space-y-3 rounded-xl bg-indigo-50 p-4">
      <h3 id="speaking-plan-title" className="font-semibold">1. Plan · about 2 minutes</h3>
      <p className="text-sm">Cue card: <strong>{cueCard}</strong></p>
      <p className="text-sm text-stone-600">Write a few key words for each point. The model stays hidden until after your first recording.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {planNotes.map((label) => <label key={label} className="space-y-1 text-sm font-medium">
          <span>{label}</span>
          <textarea value={notes[label] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [label]: event.target.value }))} maxLength={600} rows={2} className="w-full rounded-lg border border-indigo-200 bg-white p-2 font-normal" aria-label={`Notes for ${label}`} />
        </label>)}
      </div>
    </section>

    <section className="space-y-3 rounded-xl border border-stone-200 p-4">
      <h3 className="font-semibold">2. Record · 60–90 seconds</h3>
      <p className="text-sm text-stone-600">Cover each cue-card point. You’ll get the usual speaking feedback, and your first recording counts for Week {week}.</p>
      {!signedIn && <p className="rounded-lg bg-amber-50 p-3 text-sm">Sign in to save your notes and recordings. <Link href="/login" className="font-semibold text-indigo-700 underline">Sign in</Link></p>}
      <div className="flex flex-wrap gap-2">
        {!recording ? (!firstTranscript && <button type="button" disabled={busy || !signedIn} onClick={() => void startRecording(1)} className={ACTION_BUTTON_CLASS}>{busy ? 'Transcribing & analysing…' : 'Start recording'}</button>)
          : <button type="button" onClick={stopRecording} className="min-h-11 animate-pulse rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white">Stop recording</button>}
      </div>
      {firstFeedback && <Evaluation feedback={firstFeedback} week={week} />}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <WeekSpeakingRecordings recordings={props.recordings} />
    </section>

    {unlockedModel && <>
      <section className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <h3 className="font-semibold">3. Listen to the model</h3>
        <SpeakingModelPlayer text={unlockedModel.text} audioUrl={unlockedModel.audioUrl} />
        <button
          type="button"
          onClick={() => setScriptShown((shown) => !shown)}
          aria-expanded={scriptShown}
          aria-controls="speaking-model-script"
          className="min-h-11 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-950"
        >
          {scriptShown ? 'Hide the script' : 'Show the script'}
        </button>
        {scriptShown && <div id="speaking-model-script" className="rounded-xl bg-white p-4" aria-label="Model script with useful phrases highlighted">
          <h4 className="mb-2 font-semibold">Model script</h4>
          <Transcript text={unlockedModel.text} phrases={realPhrases} />
        </div>}
      </section>

      {firstTranscript && <section className="space-y-3 rounded-xl border border-stone-200 p-4">
        <h3 className="font-semibold">4. Compare</h3>
        <p className="text-sm text-stone-600">The useful phrases are highlighted in the model and your transcript.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-lg bg-stone-50 p-3"><h4 className="font-medium">Model</h4><Transcript text={unlockedModel.text} phrases={realPhrases} /></div>
          <div className="space-y-2 rounded-lg bg-indigo-50 p-3"><h4 className="font-medium">Your first recording</h4><Transcript text={firstTranscript} phrases={phrasesUsed(firstTranscript, realPhrases)} /></div>
        </div>
      </section>}

      <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <h3 className="font-semibold">5. Try again · optional</h3>
        <p className="text-sm">{retryGoal}</p>
        {secondTranscript ? <div className="space-y-3"><Evaluation feedback={secondFeedback ?? { transcript: secondTranscript }} week={week} /><p className="text-sm font-semibold">{usedOnRetry.length ? `Phrases used: ${usedOnRetry.join(' · ')}` : 'No useful phrases from the list were detected in this recording.'}</p><div className="rounded-lg bg-white p-3"><Transcript text={secondTranscript} phrases={usedOnRetry} /></div></div> : <button type="button" disabled={busy || recording} onClick={() => void startRecording(2)} className={ACTION_BUTTON_CLASS}>Record a second time</button>}
      </section>
    </>}
  </div>;
}

function Evaluation({ feedback, week }: { feedback: Feedback; week: number }) {
  return <div role="status" className="space-y-2 rounded-lg bg-stone-50 p-3 text-sm">
    {feedback.weekRecorded === true && <p className="font-semibold text-emerald-800">This counts for Week {week}.</p>}
    {feedback.weekRecorded === false && <p className="font-semibold text-amber-800">We could not count this for Week {week}. Please try again.</p>}
    {typeof feedback.score === 'number' && <p className="font-semibold">Speaking score · {feedback.score}%</p>}
    {feedback.transcript && <div><p className="text-xs font-bold uppercase text-stone-500">Transcript</p><p className="mt-1 italic">{feedback.transcript}</p></div>}
    {feedback.improvedResponse && <div><p className="text-xs font-bold uppercase text-emerald-800">A better way to say it</p><p className="mt-1 rounded-lg bg-white p-3">{feedback.improvedResponse}</p></div>}
    {feedback.feedback && <p>{feedback.feedback}</p>}
    {(feedback.tips ?? []).map((tip, index) => <p key={index}>• {tip}</p>)}
    {!feedback.feedback && feedbackText(feedback as Record<string, unknown>) && <p>{feedbackText(feedback as Record<string, unknown>)}</p>}
  </div>;
}
