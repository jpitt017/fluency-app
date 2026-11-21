'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import ListeningInputCard from '@/components/b1b2/ListeningInputCard';
import PracticeQuiz, { type QuizItem } from '@/components/b1b2/PracticeQuiz';
import { createClient } from '@/utils/supabase/client';
import type { CheckpointDetail } from '@/lib/b1b2/types';

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function CheckpointRunner({
  checkpoint,
  signedIn,
}: {
  checkpoint: CheckpointDetail;
  signedIn: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [secondsLeft, setSecondsLeft] = useState(checkpoint.duration_minutes * 60);
  const [timerActive, setTimerActive] = useState(false);

  const [quizScore, setQuizScore] = useState({ correct: 0, total: checkpoint.practiceItems.length });
  const [itemResults, setItemResults] = useState<Record<string, boolean>>({});
  const [showReserve, setShowReserve] = useState(false);
  const [speakingTranscript, setSpeakingTranscript] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [speakingResult, setSpeakingResult] = useState<{
    attemptId?: string;
    mastery: number;
    passed: boolean;
    summary: string;
    transcript?: string;
  } | null>(null);

  const [writingDraft, setWritingDraft] = useState('');
  const [writingResult, setWritingResult] = useState<{
    submissionId?: string;
    score: number;
    passed: boolean;
    summary: string;
    upgrade?: string;
  } | null>(null);

  const [busy, setBusy] = useState<'speaking' | 'writing' | 'final' | null>(null);
  const [finalOutcome, setFinalOutcome] = useState<{ overall: number; passed: boolean } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!timerActive || secondsLeft <= 0) return;
    const id = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [timerActive, secondsLeft]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const moduleNumber = checkpoint.module?.module_number ?? 2;

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
      setRecordingSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      setError('Microphone permission is unavailable here — enter a 20+ word spoken response transcript below.');
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
    if (!speakingTranscript.trim() && !audioBlob) return;
    setBusy('speaking');
    setError('');
    try {
      let res: Response;
      if (audioBlob) {
        const form = new FormData();
        form.set('audio', audioBlob, `checkpoint-${checkpoint.code}.webm`);
        form.set('moduleNumber', String(moduleNumber));
        form.set('objectiveId', checkpoint.code);
        form.set('durationSeconds', String(recordingSeconds || checkpoint.speakingTask?.target_seconds || 120));
        if (speakingTranscript.trim()) {
          form.set('transcript', speakingTranscript.trim());
        }
        res = await fetch('/api/checkpoints/evaluate', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/checkpoints/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            moduleNumber,
            objectiveId: checkpoint.code,
            transcript: speakingTranscript.trim(),
            durationSeconds: checkpoint.speakingTask?.target_seconds ?? 120,
          }),
        });
      }
      const data = (await res.json()) as {
        attempt?: { id?: string };
        mastery?: number;
        passed?: boolean;
        transcript?: string;
        rubric?: { summary?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Speaking assessment failed.');
      if (!speakingTranscript.trim() && data.transcript) {
        setSpeakingTranscript(data.transcript);
      }
      setSpeakingResult({
        attemptId: data.attempt?.id,
        mastery: Number(data.mastery ?? 0),
        passed: Boolean(data.passed),
        summary: data.rubric?.summary ?? 'Speaking attempt scored.',
        transcript: data.transcript,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Speaking assessment failed.');
    } finally {
      setBusy(null);
    }
  }

  async function evaluateWriting() {
    if (!writingDraft.trim()) return;
    setBusy('writing');
    setError('');
    try {
      const res = await fetch('/api/checkpoints/writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleNumber,
          objectiveId: checkpoint.code,
          writing: writingDraft.trim(),
        }),
      });
      const data = (await res.json()) as {
        attempt?: { id?: string };
        score?: number;
        passed?: boolean;
        rubric?: { summary?: string; upgrade?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Writing assessment failed.');
      setWritingResult({
        submissionId: data.attempt?.id,
        score: Number(data.score ?? 0),
        passed: Boolean(data.passed),
        summary: data.rubric?.summary ?? 'Writing response scored.',
        upgrade: data.rubric?.upgrade,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Writing assessment failed.');
    } finally {
      setBusy(null);
    }
  }

  const weekBreakdown = useMemo(() => {
    const groups = new Map<
      number,
      {
        week: number;
        total: number;
        answered: number;
        correct: number;
        recommendedLesson?: number;
        missedSkills: { skillTag: string; recommendedLesson?: number }[];
      }
    >();

    for (const item of checkpoint.practiceItems) {
      if (typeof item.week !== 'number') continue;
      const g = groups.get(item.week) ?? {
        week: item.week,
        total: 0,
        answered: 0,
        correct: 0,
        recommendedLesson: item.recommended_lesson,
        missedSkills: [],
      };
      g.total += 1;
      if (item.recommended_lesson && !g.recommendedLesson) {
        g.recommendedLesson = item.recommended_lesson;
      }
      if (Object.prototype.hasOwnProperty.call(itemResults, item.id)) {
        g.answered += 1;
        if (itemResults[item.id]) {
          g.correct += 1;
        } else if (item.skill_tag) {
          g.missedSkills.push({
            skillTag: item.skill_tag,
            recommendedLesson: item.recommended_lesson,
          });
        }
      }
      groups.set(item.week, g);
    }

    return Array.from(groups.values()).sort((a, b) => a.week - b.week);
  }, [checkpoint.practiceItems, itemResults]);

  function handleDiagnosticCheck(item: QuizItem, isCorrect: boolean) {
    setItemResults((prev) => ({ ...prev, [item.id]: isCorrect }));
  }

  async function finalizeCheckpoint() {
    setBusy('final');
    setError('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to submit your checkpoint.');

      const quizPct = quizScore.total > 0 ? Math.round((quizScore.correct / quizScore.total) * 100) : 70;
      const spkPct = speakingResult?.mastery ?? 0;
      const wrtPct = writingResult?.score ?? 0;
      const overall = Math.round(quizPct * 0.3 + spkPct * 0.35 + wrtPct * 0.35);
      const passed = overall >= 70 && (!speakingResult || speakingResult.passed) && (!writingResult || writingResult.passed);

      const { error: insertErr } = await supabase.from('checkpoint_attempts').insert({
        user_id: user.id,
        checkpoint_id: checkpoint.id,
        status: 'evaluated',
        speaking_attempt_id: speakingResult?.attemptId ?? null,
        writing_submission_id: writingResult?.submissionId ?? null,
        scores: {
          quizScore: quizPct,
          speakingScore: spkPct,
          writingScore: wrtPct,
          overall,
        },
        result: {
          passed,
          overall,
          quizCorrect: quizScore.correct,
          quizTotal: quizScore.total,
          separateOpenResponses: Boolean(checkpoint.separateOpenResponses),
          weekBreakdown: weekBreakdown.length ? weekBreakdown : undefined,
          code: checkpoint.code,
        },
        completed_at: new Date().toISOString(),
      });

      if (insertErr) throw insertErr;
      await supabase.rpc('evaluate_badges');

      setFinalOutcome({ overall, passed });
      setTimerActive(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not finalize checkpoint.');
    } finally {
      setBusy(null);
    }
  }

  const latestResult = checkpoint.latestAttempt?.result as { overall?: number; passed?: boolean } | undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
            {checkpoint.code} · {checkpoint.timing_label}
          </p>
          <p className="mt-1 text-sm text-stone-600">{checkpoint.description}</p>
          {checkpoint.latestAttempt && (
            <div className="mt-2 space-y-1 text-xs">
              <p className="font-semibold text-emerald-700">
                Latest attempt: {checkpoint.latestAttempt.status}
                {typeof latestResult?.overall === 'number' ? ` · ${latestResult.overall}%` : ''}
                {checkpoint.latestAttempt.teacher_status ? ` · Teacher: ${checkpoint.latestAttempt.teacher_status}` : ''}
              </p>
              {checkpoint.latestAttempt.teacher_readiness_decision && (
                <p className="font-semibold text-indigo-800">
                  Readiness outcome:{' '}
                  {checkpoint.latestAttempt.teacher_readiness_decision === 'ready_for_b2_exam_prep'
                    ? 'Ready to start B2 exam preparation'
                    : 'Named next step'}
                </p>
              )}
              {checkpoint.latestAttempt.teacher_notes && (
                <p className="text-stone-600">Teacher note: {checkpoint.latestAttempt.teacher_notes}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-center">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">Timer</span>
            <span className="font-mono text-lg font-bold text-stone-900">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setTimerActive((v) => !v)}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            {timerActive ? 'Pause timer' : 'Start timer'}
          </button>
        </div>
      </div>

      {!signedIn && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-950">
          <p className="font-semibold">Sign in to take and submit this milestone assessment.</p>
          <Link
            href={`/login?next=/checkpoints/${checkpoint.code}`}
            className="mt-3 inline-block rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
          >
            Sign in to begin {checkpoint.code}
          </Link>
        </div>
      )}

      {checkpoint.inputs.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="font-serif text-xl font-bold text-stone-900">Part 1 · Listening &amp; Reading Input</h2>
          <div className="mt-4 space-y-4">
            {checkpoint.inputs.map((inp) => (
              <ListeningInputCard key={inp.id} input={inp} />
            ))}
          </div>
        </section>
      )}

      {checkpoint.practiceItems.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="font-serif text-xl font-bold text-stone-900">
            {checkpoint.separateOpenResponses
              ? 'Part 1 · 16-Item Grammar Diagnostic (Weeks 1–4)'
              : 'Part 2 · Grammar & Vocabulary Diagnostic'}
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Check your accuracy across {checkpoint.practiceItems.length}{' '}
            {checkpoint.separateOpenResponses ? 'core scored items (4 per week).' : 'module checkpoint items.'}
          </p>
          <PracticeQuiz
            hideCustomSentence={Boolean(checkpoint.separateOpenResponses)}
            items={checkpoint.practiceItems.map((item) => ({
              id: item.id,
              prompt: item.prompt,
              options: item.options,
              answer: item.answer,
              accepted_answers: item.accepted_answers,
              explanation: item.explanation,
              week: item.week,
              skill_tag: item.skill_tag,
              recommended_lesson: item.recommended_lesson,
            }))}
            onScoreChange={(correct, total) => setQuizScore({ correct, total })}
            onItemChecked={(item, isCorrect) => handleDiagnosticCheck(item, isCorrect)}
          />

          {weekBreakdown.length > 0 && (
            <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-indigo-900">
                Per-Week &amp; Skill Breakdown · Next-Step Recommendations
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {weekBreakdown.map((wb) => (
                  <div key={wb.week} className="rounded-lg bg-white p-3 text-xs ring-1 ring-indigo-100">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-stone-900">Week {wb.week}</span>
                      <span className="font-semibold text-indigo-700">
                        {wb.correct}/{wb.total}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-stone-500">
                      {wb.answered} of {wb.total} checked
                    </p>
                    {wb.missedSkills.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-stone-100 pt-2">
                        {wb.missedSkills.map((ms, idx) => (
                          <p key={idx} className="text-[11px] text-rose-700">
                            Review: {ms.skillTag}
                          </p>
                        ))}
                        {wb.recommendedLesson && (
                          <Link
                            href={`/curriculum/lessons/${wb.recommendedLesson}`}
                            className="inline-block font-semibold text-indigo-700 hover:underline"
                          >
                            Practise Week {wb.week} Tuesday →
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {checkpoint.reservePracticeItems && checkpoint.reservePracticeItems.length > 0 && (
            <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-stone-700">
                    Optional Reserve Items ({checkpoint.reservePracticeItems.length} extra · 1 per week)
                  </p>
                  <p className="text-xs text-stone-500">
                    Unscored extra checks — does not affect your 16-item diagnostic score.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReserve((v) => !v)}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                >
                  {showReserve ? 'Hide reserve items' : 'Show 4 reserve items'}
                </button>
              </div>
              {showReserve && (
                <PracticeQuiz
                  compact
                  items={checkpoint.reservePracticeItems.map((item) => ({
                    id: item.id,
                    prompt: item.prompt,
                    options: item.options,
                    answer: item.answer,
                    accepted_answers: item.accepted_answers,
                    explanation: item.explanation,
                  }))}
                />
              )}
            </div>
          )}
        </section>
      )}

      {checkpoint.speakingTask && (
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-800">
            {checkpoint.separateOpenResponses
              ? 'Part 2 · Separate Spoken Narrative (45–60s)'
              : 'Part 3 · Speaking Task'}
          </span>
          <h2 className="mt-2 font-serif text-xl font-bold text-stone-900">{checkpoint.speakingTask.title}</h2>
          <p className="mt-2 text-sm text-stone-700">{checkpoint.speakingTask.prompt}</p>
          <p className="mt-1 text-xs text-stone-500">
            Target length: ~{checkpoint.speakingTask.target_seconds}s · Record with your mic or enter 20+ words
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {!recording ? (
              <button
                type="button"
                disabled={!signedIn}
                onClick={startRecording}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 transition hover:bg-stone-50 disabled:opacity-50"
              >
                {audioBlob ? 'Re-record mic' : 'Record mic'}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800"
              >
                Stop ({recordingSeconds}s)
              </button>
            )}
            {audioUrl && <audio controls src={audioUrl} className="h-8 max-w-full" />}
          </div>

          <textarea
            rows={4}
            value={speakingTranscript}
            onChange={(e) => setSpeakingTranscript(e.target.value)}
            placeholder="Record with your mic above or paste/write your spoken response transcript (20+ words)…"
            className="mt-3 w-full rounded-xl border border-stone-300 bg-stone-50/50 p-3 text-sm text-stone-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-stone-500">
              {audioBlob && !speakingTranscript.trim()
                ? `Audio recorded (${recordingSeconds}s)`
                : `${wordCount(speakingTranscript)} words`}
            </span>
            <button
              type="button"
              disabled={!signedIn || busy === 'speaking' || (!audioBlob && wordCount(speakingTranscript) < 20)}
              onClick={evaluateSpeaking}
              className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:bg-stone-300"
            >
              {busy === 'speaking' ? 'Scoring speaking…' : 'Score speaking part'}
            </button>
          </div>

          {speakingResult && (
            <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-sm">
              <p className="font-bold text-indigo-950">
                Speaking score: {speakingResult.mastery}% ({speakingResult.passed ? 'Pass' : 'Needs revision'})
              </p>
              <p className="mt-1 text-xs text-stone-700">{speakingResult.summary}</p>
            </div>
          )}
        </section>
      )}

      {checkpoint.writingTask && (
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-indigo-800">
            {checkpoint.separateOpenResponses
              ? 'Part 3 · Separate Written Visitor Note (100–140 words)'
              : 'Part 4 · Writing Task'}
          </span>
          <h2 className="mt-2 font-serif text-xl font-bold text-stone-900">{checkpoint.writingTask.title}</h2>
          <p className="mt-2 text-sm text-stone-700">{checkpoint.writingTask.prompt}</p>
          <p className="mt-1 text-xs text-stone-500">
            Target {checkpoint.writingTask.word_min}–{checkpoint.writingTask.word_max} words (minimum 30 words to assess)
          </p>

          <textarea
            rows={6}
            value={writingDraft}
            onChange={(e) => setWritingDraft(e.target.value)}
            placeholder="Write your milestone essay, report, or structured response here (30+ words)…"
            className="mt-3 w-full rounded-xl border border-stone-300 bg-stone-50/50 p-3 text-sm text-stone-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-stone-500">{wordCount(writingDraft)} words</span>
            <button
              type="button"
              disabled={!signedIn || busy === 'writing' || wordCount(writingDraft) < 30}
              onClick={evaluateWriting}
              className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:bg-stone-300"
            >
              {busy === 'writing' ? 'Scoring writing…' : 'Score writing part'}
            </button>
          </div>

          {writingResult && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm">
              <p className="font-bold text-emerald-950">
                Writing score: {writingResult.score}% ({writingResult.passed ? 'Pass' : 'Needs revision'})
              </p>
              <p className="mt-1 text-xs text-stone-700">{writingResult.summary}</p>
              {writingResult.upgrade && (
                <p className="mt-2 text-xs font-medium text-emerald-900">B2 tip: {writingResult.upgrade}</p>
              )}
            </div>
          )}
        </section>
      )}

      {error && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}

      {finalOutcome ? (
        <div
          className={`rounded-2xl border p-6 ${
            finalOutcome.passed ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-amber-300 bg-amber-50 text-amber-950'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wider">Milestone Outcome</p>
          {checkpoint.separateOpenResponses ? (
            <>
              <h2 className="mt-1 font-serif text-2xl font-bold">
                {checkpoint.code} Recorded · Diagnostic {quizScore.correct}/{quizScore.total}
              </h2>
              <p className="mt-1 text-sm">
                Reported separately: Grammar diagnostic {quizScore.correct}/{quizScore.total} · Spoken narrative{' '}
                {speakingResult ? `${speakingResult.mastery}%` : 'not submitted'} · Visitor note{' '}
                {writingResult ? `${writingResult.score}%` : 'not submitted'}.
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-1 font-serif text-2xl font-bold">
                {finalOutcome.passed ? `${checkpoint.code} Passed — ${finalOutcome.overall}%` : `${checkpoint.code} Completed — ${finalOutcome.overall}%`}
              </h2>
              <p className="mt-1 text-sm">
                {finalOutcome.passed
                  ? '150 XP awarded and your milestone badge eligibility has been updated.'
                  : 'Score 70%+ across the diagnostic quiz, speaking, and writing tasks to pass this milestone.'}
              </p>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard" className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white">
              Return to dashboard
            </Link>
            <Link href="/curriculum" className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800">
              Browse curriculum
            </Link>
          </div>
        </div>
      ) : (
        signedIn && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-xs text-stone-600">
              {checkpoint.separateOpenResponses ? 'Separate scores — ' : ''}Diagnostic quiz: {quizScore.correct}/
              {quizScore.total || '—'} · Speaking: {speakingResult ? `${speakingResult.mastery}%` : 'pending'} · Writing:{' '}
              {writingResult ? `${writingResult.score}%` : 'pending'}
            </p>
            <button
              type="button"
              disabled={busy === 'final' || (!speakingResult && !writingResult)}
              onClick={finalizeCheckpoint}
              className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:bg-stone-300"
            >
              {busy === 'final' ? 'Submitting milestone…' : `Submit ${checkpoint.code} checkpoint`}
            </button>
          </div>
        )
      )}
    </div>
  );
}
