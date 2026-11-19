'use client';

import { useRef, useState } from 'react';
import type { LessonLabContext } from './LessonLabContext';

interface SpeakingFeedback {
  transcript?: string;
  improvedResponse?: string;
  naturalBritishVersion?: string;
  feedback?: string;
  tips?: string[];
  pronunciationFeedback?: string[];
  pragmaticsFeedback?: string[];
  score?: number;
  passed?: boolean;
  mastery?: number;
  rubric?: Record<string, unknown>;
  reviewDeck?: string[];
}
interface SpeakingLabProps {
  sessionTitle?: string;
  pronunciationFocus?: string;
  speakingFocus?: string;
  keyLanguage?: string[];
  lessonContext?: LessonLabContext;
}

export default function SpeakingLab({ sessionTitle, pronunciationFocus, speakingFocus, keyLanguage = [], lessonContext }: SpeakingLabProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const startedAt = useRef(0);
  const activeTitle = lessonContext ? `Module ${lessonContext.moduleId ?? ''} · Lesson ${lessonContext.lessonId ?? ''}` : sessionTitle;
  const languages = lessonContext?.targetVocabulary ?? keyLanguage;

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
      data.forEach((value, index) => { context.fillStyle = '#059669'; context.fillRect(index * width, canvas.height - value / 255 * canvas.height, Math.max(1, width - 1), value / 255 * canvas.height); });
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
    setIsAnalyzing(true); setError(null);
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    try {
      const form = new FormData();
      form.set('audio', blob, 'lesson-recording.webm');
      if (lessonContext?.mode === 'checkpoint' && lessonContext.moduleId && lessonContext.cefrSkill) {
        const suffix = lessonContext.cefrSkill === 'Spoken Interaction' ? 'SI' : 'SP';
        form.set('moduleNumber', String(lessonContext.moduleId));
        form.set('objectiveId', `B1_M${lessonContext.moduleId}_${suffix}`);
        form.set('durationSeconds', String(durationSeconds));
        const result = await fetch('/api/checkpoints/evaluate', { method: 'POST', body: form });
        const data = await result.json();
        if (!result.ok) throw new Error(data.error || 'Checkpoint assessment failed.');
        const assessment = { transcript: data.transcript, feedback: data.rubric?.summary, score: data.mastery, passed: data.passed, mastery: data.mastery, rubric: data.rubric, reviewDeck: data.reviewDeck };
        setFeedback(assessment);
        lessonContext.onComplete?.({ transcript: data.transcript, score: data.mastery, passed: data.passed, rubric: data.rubric });
        return;
      }

      form.set('prompt', lessonContext?.prompt ?? speakingFocus ?? 'General B1 British English speaking practice');
      form.set('targetPhrase', [...(lessonContext?.targetGrammar ?? []), ...languages].join(', '));
      const response = await fetch('/api/speaking/evaluate', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to evaluate speech.');
      setFeedback(data);
      lessonContext?.onComplete?.({ transcript: data.transcript, score: data.score });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'An error occurred while analysing your speech.');
    } finally { setIsAnalyzing(false); }
  }

  async function startRecording() {
    setError(null); setFeedback(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Audio recording is not supported in this browser. Try a current desktop or mobile browser.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audio = new AudioContext(); audioContextRef.current = audio;
      const analyser = audio.createAnalyser(); analyser.fftSize = 64;
      audio.createMediaStreamSource(stream).connect(analyser); drawVisualizer(analyser);
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder; chunksRef.current = []; startedAt.current = Date.now();
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop()); stopVisualizer();
        await evaluateAudio(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.start(); setIsRecording(true);
    } catch { setError('Microphone access denied or unavailable. Check your browser permissions.'); stopVisualizer(); }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') { mediaRecorderRef.current.stop(); setIsRecording(false); }
  }

  return <div className="space-y-4">
    {(lessonContext?.prompt || pronunciationFocus || speakingFocus || languages.length > 0) && <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/70 p-3.5"><p className="text-xs font-bold uppercase tracking-wider text-emerald-800">{lessonContext?.mode === 'checkpoint' ? 'CEFR checkpoint speaking task' : 'Speaking & pronunciation focus'}</p>{lessonContext?.prompt && <p className="text-sm text-slate-800">{lessonContext.prompt}</p>}{pronunciationFocus && <p className="text-xs"><strong>Pronunciation:</strong> {pronunciationFocus}</p>}{speakingFocus && <p className="text-xs"><strong>Fluency:</strong> {speakingFocus}</p>}{(lessonContext?.targetGrammar?.length ?? 0) > 0 && <p className="text-xs"><strong>Target grammar:</strong> {lessonContext?.targetGrammar?.join(' · ')}</p>}{languages.length > 0 && <div className="flex flex-wrap gap-1.5">{languages.map((item) => <span key={item} className="rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-xs text-emerald-900">{item}</span>)}</div>}</div>}
    {lessonContext?.durationSeconds && <p className="text-xs text-slate-500">Suggested speaking time: {lessonContext.durationSeconds} seconds.</p>}
    <div className="flex flex-wrap items-center gap-4">{!isRecording ? <button type="button" onClick={startRecording} disabled={isAnalyzing} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{isAnalyzing ? 'Transcribing & analysing…' : '🎙️ Start recording'}</button> : <button type="button" onClick={stopRecording} className="animate-pulse rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white">⏹ Stop recording</button>}<canvas ref={canvasRef} width={160} height={36} aria-label="Live audio waveform" className={`rounded-md border bg-gray-900 ${isRecording ? 'opacity-100' : 'opacity-40'}`}/>{isRecording && <span aria-live="polite" className="text-xs text-red-600">Recording live…</span>}</div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {feedback && <div role="status" className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">{typeof feedback.passed === 'boolean' && <p className={feedback.passed ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>{feedback.passed ? 'Can-Do checkpoint passed' : 'Review and try again'}{feedback.mastery !== undefined ? ` · ${feedback.mastery}% mastery` : ''}</p>}{feedback.transcript && <div><span className="text-xs font-bold uppercase text-gray-500">Transcript</span><p className="mt-1 italic text-gray-800">{feedback.transcript}</p></div>}{feedback.naturalBritishVersion && <div><span className="text-xs font-bold uppercase text-emerald-800">Suggested British English version</span><p className="mt-1">{feedback.naturalBritishVersion}</p></div>}{feedback.improvedResponse && <div><span className="text-xs font-bold uppercase text-emerald-800">Model response</span><p className="mt-1">{feedback.improvedResponse}</p></div>}{feedback.feedback && <p className="text-gray-700">{feedback.feedback}</p>}{feedback.tips?.map((tip, index) => <p key={index} className="text-gray-700">• {tip}</p>)}{feedback.pronunciationFeedback?.map((item, index) => <p key={`p${index}`} className="text-gray-700">• {item}</p>)}{feedback.pragmaticsFeedback?.map((item, index) => <p key={`g${index}`} className="text-gray-700">• {item}</p>)}{feedback.reviewDeck?.length ? <ul className="list-disc pl-5">{feedback.reviewDeck.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}</div>}
  </div>;
}
