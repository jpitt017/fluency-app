'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Award, CheckCircle2, Mic, PenLine, UserCheck } from 'lucide-react';
import type { TeacherRosterLearner } from '@/lib/b1b2/types';

export default function TeacherConsoleClient({ learners }: { learners: TeacherRosterLearner[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(learners[0]?.user_id ?? '');
  const [notesByTarget, setNotesByTarget] = useState<Record<string, string>>({});
  const [pronNotesByTarget, setPronNotesByTarget] = useState<Record<string, string>>({});
  const [decisionByTarget, setDecisionByTarget] = useState<Record<string, 'ready_for_b2_exam_prep' | 'named_next_step'>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string>('');

  const selected = learners.find((l) => l.user_id === selectedId) ?? learners[0] ?? null;

  async function submitReview(params: {
    targetType: 'speaking' | 'writing' | 'checkpoint';
    targetId: string;
    teacherStatus: 'confirmed' | 'needs_work' | 'overridden';
  }) {
    const key = `${params.targetType}:${params.targetId}`;
    setSavingKey(key);
    setFeedbackBanner('');

    try {
      const res = await fetch('/api/teacher/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: params.targetType,
          targetId: params.targetId,
          teacherStatus: params.teacherStatus,
          teacherNotes: notesByTarget[key] ?? null,
          pronunciationNote: params.targetType === 'speaking' ? (pronNotesByTarget[key] ?? null) : null,
          readinessDecision: params.targetType === 'checkpoint' ? (decisionByTarget[key] ?? null) : null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not save teacher review.');
      setFeedbackBanner(`Saved teacher review (${params.teacherStatus}).`);
      router.refresh();
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingKey(null);
    }
  }

  if (learners.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
        No learners are currently enrolled in the roster.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
      {/* Roster sidebar */}
      <aside className="space-y-2 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs lg:col-span-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <h2 className="font-serif text-base font-semibold text-stone-900">
            Learner Roster ({learners.length})
          </h2>
          <span className="text-[11px] font-semibold text-stone-500">B1 → B2 Studio</span>
        </div>

        <div className="space-y-2">
          {learners.map((learner) => {
            const active = learner.user_id === selected?.user_id;
            return (
              <button
                key={learner.user_id}
                type="button"
                onClick={() => setSelectedId(learner.user_id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-indigo-600 bg-indigo-50/70'
                    : 'border-stone-200/80 bg-stone-50/50 hover:border-indigo-300 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-stone-900">{learner.full_name}</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-stone-200">
                    {learner.streak_days}d streak
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
                  <span>{learner.learner_band.replace(/_/g, ' ')}</span>
                  <span>·</span>
                  <span>{learner.recent_speaking.length} spk · {learner.recent_writing.length} wrt</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Selected learner detail */}
      {selected && (
        <section className="space-y-6 lg:col-span-8">
          {feedbackBanner && (
            <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900">
              {feedbackBanner}
            </div>
          )}

          {/* Overview card */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-indigo-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    Learner Snapshot
                  </span>
                </div>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900">{selected.full_name}</h2>
                {selected.email && <p className="text-xs text-stone-500">{selected.email}</p>}
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-indigo-50 px-3 py-1 font-semibold text-indigo-800">
                  Speaking: {selected.recent_speaking.length} · Writing: {selected.recent_writing.length}
                </span>
                <span className="rounded-full bg-stone-100 px-3 py-1 font-semibold text-stone-700">
                  Streak: {selected.streak_days}d
                </span>
              </div>
            </div>

            {/* Top recurring errors */}
            {selected.top_errors.length > 0 && (
              <div className="mt-5 border-t border-stone-100 pt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Top Error Patterns (for live lessons)
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.top_errors.map((err) => (
                    <span
                      key={err.error_category}
                      className="rounded-full border border-amber-200 bg-amber-50/70 px-3 py-1 text-xs font-semibold text-amber-950"
                    >
                      {err.error_category.replace(/_/g, ' ')} ({err.occurrences}×)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Checkpoint confirmation & Checkpoint 4 Readiness Decision */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-emerald-700" />
              <h3 className="font-serif text-lg font-semibold text-stone-900">
                Checkpoint Confirmations &amp; Final B2 Decision
              </h3>
            </div>
            {selected.checkpoints.length === 0 ? (
              <p className="mt-3 text-xs text-stone-500">No checkpoint attempts submitted yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {selected.checkpoints.map((cp) => {
                  const key = `checkpoint:${cp.attempt_id}`;
                  const isFinal = cp.code === 'final_b2_assessment';
                  const decisionVal =
                    decisionByTarget[key] ??
                    (cp.teacher_readiness_decision as 'ready_for_b2_exam_prep' | 'named_next_step' | undefined) ??
                    'ready_for_b2_exam_prep';

                  return (
                    <div key={cp.attempt_id} className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 p-4 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-stone-900">{cp.title}</span>{' '}
                          <span className="text-stone-500">({cp.timing})</span>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-indigo-800 ring-1 ring-stone-200">
                          Teacher: {cp.teacher_status ?? 'pending'}
                        </span>
                      </div>

                      {isFinal && (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="font-semibold text-stone-700">Checkpoint 4 outcome:</label>
                          <select
                            value={decisionVal}
                            onChange={(e) =>
                              setDecisionByTarget((prev) => ({
                                ...prev,
                                [key]: e.target.value as 'ready_for_b2_exam_prep' | 'named_next_step',
                              }))
                            }
                            className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-800"
                          >
                            <option value="ready_for_b2_exam_prep">Ready to start B2 exam preparation</option>
                            <option value="named_next_step">Named next step required</option>
                          </select>
                        </div>
                      )}

                      <textarea
                        rows={2}
                        value={notesByTarget[key] ?? cp.teacher_notes ?? ''}
                        onChange={(e) => setNotesByTarget((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={
                          isFinal
                            ? 'Add Checkpoint 4 confirmation or named next step (e.g., focus on hedging / articles)…'
                            : 'Add teacher confirmation note or override reasoning…'
                        }
                        className="w-full rounded-lg border border-stone-300 bg-white p-2.5 text-xs text-stone-900"
                      />

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={savingKey === key}
                          onClick={() =>
                            void submitReview({
                              targetType: 'checkpoint',
                              targetId: cp.attempt_id,
                              teacherStatus: 'confirmed',
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Confirm</span>
                        </button>
                        <button
                          type="button"
                          disabled={savingKey === key}
                          onClick={() =>
                            void submitReview({
                              targetType: 'checkpoint',
                              targetId: cp.attempt_id,
                              teacherStatus: 'needs_work',
                            })
                          }
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          Needs work
                        </button>
                        <button
                          type="button"
                          disabled={savingKey === key}
                          onClick={() =>
                            void submitReview({
                              targetType: 'checkpoint',
                              targetId: cp.attempt_id,
                              teacherStatus: 'overridden',
                            })
                          }
                          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                        >
                          Override AI
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Speaking review (teacher pronunciation + override) */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-rose-700" />
              <h3 className="font-serif text-lg font-semibold text-stone-900">
                Speaking Submissions &amp; Live Pronunciation Notes
              </h3>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              AI evaluates content, grammar, vocabulary, and coherence only; use this panel to log live pronunciation feedback and confirm readiness.
            </p>
            {selected.recent_speaking.length === 0 ? (
              <p className="mt-3 text-xs text-stone-500">No speaking recordings submitted yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {selected.recent_speaking.map((spk) => {
                  const key = `speaking:${spk.id}`;
                  return (
                    <div key={spk.id} className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 p-4 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-stone-900">
                          {spk.task_title ?? 'Speaking recording'} · {spk.overall ?? '—'}/100
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-indigo-800 ring-1 ring-stone-200">
                          {spk.teacher_status}
                        </span>
                      </div>
                      {spk.transcript && (
                        <p className="rounded-lg bg-white p-2.5 italic text-stone-700">&ldquo;{spk.transcript}&rdquo;</p>
                      )}
                      <input
                        type="text"
                        value={pronNotesByTarget[key] ?? spk.teacher_pronunciation_note ?? ''}
                        onChange={(e) => setPronNotesByTarget((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder="Teacher pronunciation & prosody note (e.g. final consonant clusters, sentence stress)…"
                        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900"
                      />
                      <textarea
                        rows={2}
                        value={notesByTarget[key] ?? spk.teacher_notes ?? ''}
                        onChange={(e) => setNotesByTarget((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder="General teacher note / override comment…"
                        className="w-full rounded-lg border border-stone-300 bg-white p-2.5 text-xs text-stone-900"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={savingKey === key}
                          onClick={() =>
                            void submitReview({
                              targetType: 'speaking',
                              targetId: spk.id,
                              teacherStatus: 'confirmed',
                            })
                          }
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          disabled={savingKey === key}
                          onClick={() =>
                            void submitReview({
                              targetType: 'speaking',
                              targetId: spk.id,
                              teacherStatus: 'needs_work',
                            })
                          }
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          Needs work
                        </button>
                        <button
                          type="button"
                          disabled={savingKey === key}
                          onClick={() =>
                            void submitReview({
                              targetType: 'speaking',
                              targetId: spk.id,
                              teacherStatus: 'overridden',
                            })
                          }
                          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                        >
                          Override AI
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Writing review */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center gap-2">
              <PenLine className="h-4 w-4 text-indigo-700" />
              <h3 className="font-serif text-lg font-semibold text-stone-900">
                Writing Submissions &amp; Teacher Confirmation
              </h3>
            </div>
            {selected.recent_writing.length === 0 ? (
              <p className="mt-3 text-xs text-stone-500">No writing tasks submitted yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {selected.recent_writing.map((wrt) => {
                  const key = `writing:${wrt.id}`;
                  return (
                    <div key={wrt.id} className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 p-4 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-stone-900">
                          {wrt.task_title ?? 'Saturday writing'} · {wrt.word_count ?? '—'}w · {wrt.overall ?? '—'}/100
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-indigo-800 ring-1 ring-stone-200">
                          {wrt.teacher_status}
                        </span>
                      </div>
                      <p className="whitespace-pre-line rounded-lg bg-white p-2.5 text-stone-800">{wrt.body}</p>
                      <textarea
                        rows={2}
                        value={notesByTarget[key] ?? wrt.teacher_notes ?? ''}
                        onChange={(e) => setNotesByTarget((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder="Teacher note or correction guidance…"
                        className="w-full rounded-lg border border-stone-300 bg-white p-2.5 text-xs text-stone-900"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={savingKey === key}
                          onClick={() =>
                            void submitReview({
                              targetType: 'writing',
                              targetId: wrt.id,
                              teacherStatus: 'confirmed',
                            })
                          }
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          disabled={savingKey === key}
                          onClick={() =>
                            void submitReview({
                              targetType: 'writing',
                              targetId: wrt.id,
                              teacherStatus: 'needs_work',
                            })
                          }
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          Needs work
                        </button>
                        <button
                          type="button"
                          disabled={savingKey === key}
                          onClick={() =>
                            void submitReview({
                              targetType: 'writing',
                              targetId: wrt.id,
                              teacherStatus: 'overridden',
                            })
                          }
                          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                        >
                          Override AI
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
