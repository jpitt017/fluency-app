'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import PracticeQuiz from '@/components/b1b2/PracticeQuiz';
import WarmUpDeck from '@/components/b1b2/WarmUpDeck';
import ListenButton from '@/components/b1b2/ListenButton';
import OutputStudio from '@/components/b1b2/OutputStudio';
import type {
  BlockKind,
  FeedbackContent,
  InputContent,
  LessonPayload,
  OutputContent,
  PracticeContent,
  WarmUpContent,
} from '@/lib/b1b2/types';

const BLOCK_META: Record<BlockKind, { label: string; accent: string }> = {
  warm_up: { label: 'Warm-up', accent: 'bg-amber-100 text-amber-900' },
  input: { label: 'Input', accent: 'bg-sky-100 text-sky-900' },
  practice: { label: 'Practice', accent: 'bg-indigo-100 text-indigo-900' },
  output: { label: 'Output', accent: 'bg-rose-100 text-rose-900' },
  feedback: { label: 'Feedback', accent: 'bg-emerald-100 text-emerald-900' },
};

export default function LessonRunner({ payload, signedIn }: { payload: LessonPayload; signedIn: boolean }) {
  const router = useRouter();
  const { lesson, module, blocks, items, progress } = payload;

  const [practiceScore, setPracticeScore] = useState({ correct: 0, total: items.length });
  const [outputSubmitted, setOutputSubmitted] = useState(Boolean(progress?.output_submitted));
  const [rubricChecked, setRubricChecked] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState(progress?.status === 'completed');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const orderedBlocks = useMemo(() => [...blocks].sort((a, b) => a.sort_order - b.sort_order), [blocks]);

  async function markComplete() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/curriculum/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonNumber: lesson.lesson_number,
          completed: true,
          correctCount: practiceScore.correct,
          totalCount: practiceScore.total || items.length,
          outputSubmitted,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not save your progress.');
      setCompleted(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your progress.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {orderedBlocks.map((block, index) => {
        const meta = BLOCK_META[block.block_kind] ?? { label: block.block_kind, accent: 'bg-slate-100 text-slate-700' };
        return (
          <section key={block.id} aria-label={`${meta.label} block`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${meta.accent}`}>{meta.label}</span>
                <h2 className="text-base font-bold text-slate-900">{block.title}</h2>
              </div>
              <span className="text-xs font-semibold text-slate-500">~{block.minutes} min</span>
            </div>

            <div className="mt-4">
              {block.block_kind === 'warm_up' && (
                <WarmUpSection
                  content={block.content as WarmUpContent}
                  lessonNumber={lesson.lesson_number}
                  signedIn={signedIn}
                />
              )}

              {block.block_kind === 'input' && (
                <InputSection content={block.content as InputContent} payload={payload} />
              )}

              {block.block_kind === 'practice' && (
                <PracticeSection content={block.content as PracticeContent} items={items} onScoreChange={(correct, total) => setPracticeScore({ correct, total })} signedIn={signedIn} lessonNumber={lesson.lesson_number} />
              )}

              {block.block_kind === 'output' && (
                <OutputSection
                  content={block.content as OutputContent}
                  payload={payload}
                  signedIn={signedIn}
                  onSubmitted={() => setOutputSubmitted(true)}
                />
              )}

              {block.block_kind === 'feedback' && (
                <FeedbackSection
                  content={block.content as FeedbackContent}
                  checked={rubricChecked}
                  onToggle={(key) => setRubricChecked((current) => ({ ...current, [key]: !current[key] }))}
                  completed={completed}
                  saving={saving}
                  signedIn={signedIn}
                  lessonNumber={lesson.lesson_number}
                  practiceScore={practiceScore}
                  outputSubmitted={outputSubmitted}
                  xpReward={lesson.xp_reward}
                  onComplete={markComplete}
                />
              )}
            </div>
          </section>
        );
      })}

      {error && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}

      <p className="text-center text-xs text-slate-500">
        Module {module.number} · {module.title} · lesson {lesson.module_lesson_number} of 8
      </p>
    </div>
  );
}

function WarmUpSection({ content, lessonNumber, signedIn }: { content: WarmUpContent; lessonNumber: number; signedIn: boolean }) {
  return (
    <>
      <p className="text-sm text-slate-700">{content.summary}</p>
      <div className="mt-3">
        <WarmUpDeck
          lessonNumber={lessonNumber}
          signedIn={signedIn}
          cardCount={content.card_count ?? 8}
          reviewLadderDays={content.review_ladder_days ?? [1, 3, 7, 14, 30]}
          deckSlug={content.deck_slug ?? null}
          limit={Math.max(content.card_count ?? 8, 8)}
        />
      </div>
    </>
  );
}

function InputSection({ content, payload }: { content: InputContent; payload: LessonPayload }) {
  const input = payload.input;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">{content.summary}</p>

      {input && (
        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-white px-2 py-0.5 font-bold uppercase text-slate-700">{input.kind}</span>
            <span className="font-semibold text-slate-900">{input.title}</span>
            {input.accent && <span className="text-slate-500">· {input.accent} accent</span>}
            {input.duration_seconds ? <span className="text-slate-500">· {input.duration_seconds}s</span> : null}
            {input.word_count ? <span className="text-slate-500">· {input.word_count} words</span> : null}
          </div>
          <div className="mt-3">
            <ListenButton text={input.body} accent={input.accent} />
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-600">Show transcript</summary>
            <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-800">{input.body}</p>
          </details>
          <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">Source: {input.source_label}</p>

          {input.questions?.length ? (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Comprehension check</h3>
              <PracticeQuiz
                compact
                items={input.questions.map((question, index) => ({
                  id: `${input.id}-q${index}`,
                  prompt: question.prompt,
                  options: question.options,
                  answer: question.answer,
                  explanation: null,
                }))}
              />
            </div>
          ) : null}
        </article>
      )}

      {content.key_points?.length ? (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Key points</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
            {content.key_points.map((point) => (
              <li key={point} className="flex gap-2">
                <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {content.model_example && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Model example</h3>
          <p className="mt-2 rounded-lg border-l-4 border-indigo-300 bg-indigo-50/50 p-3 text-sm italic leading-6 text-slate-700">{content.model_example}</p>
        </div>
      )}
    </div>
  );
}

function PracticeSection({
  content,
  items,
  onScoreChange,
  signedIn,
  lessonNumber,
}: {
  content: PracticeContent;
  items: LessonPayload['items'];
  onScoreChange: (correct: number, total: number) => void;
  signedIn: boolean;
  lessonNumber: number;
}) {
  return (
    <div>
      <p className="text-sm text-slate-700">{content.summary}</p>
      <p className="mt-1 text-xs text-slate-500">
        {content.item_count} items
        {content.mix?.grammar ? ` · ${content.mix.grammar} grammar` : ''}
        {content.mix?.vocabulary ? ` · ${content.mix.vocabulary} vocabulary` : ''}
        {content.answer_mode ? ` · ${content.answer_mode.replace(/_/g, ' ')}` : ''}
      </p>

      {items.length ? (
        <PracticeQuiz
          items={items.map((item) => ({
            id: item.id,
            prompt: item.prompt,
            options: item.options,
            answer: item.answer,
            explanation: item.explanation,
          }))}
          onScoreChange={onScoreChange}
        />
      ) : (
        <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <p>Practice answers are only visible when you are signed in.</p>
          <a
            href={`/login?next=/curriculum/lessons/${lessonNumber}`}
            className="mt-2 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            {signedIn ? 'Reload after signing in' : 'Sign in to practise'}
          </a>
        </div>
      )}
    </div>
  );
}

function OutputSection({
  content,
  payload,
  signedIn,
  onSubmitted,
}: {
  content: OutputContent;
  payload: LessonPayload;
  signedIn: boolean;
  onSubmitted: () => void;
}) {
  return (
    <div>
      <p className="text-sm text-slate-700">{content.summary}</p>
      <div className="mt-3">
        <OutputStudio
          lessonId={payload.lesson.id}
          lessonNumber={payload.lesson.lesson_number}
          signedIn={signedIn}
          speaking={payload.speaking}
          writing={payload.writing}
          onSubmitted={onSubmitted}
        />
      </div>
    </div>
  );
}

function FeedbackSection({
  content,
  checked,
  onToggle,
  completed,
  saving,
  signedIn,
  lessonNumber,
  practiceScore,
  outputSubmitted,
  xpReward,
  onComplete,
}: {
  content: FeedbackContent;
  checked: Record<string, boolean>;
  onToggle: (key: string) => void;
  completed: boolean;
  saving: boolean;
  signedIn: boolean;
  lessonNumber: number;
  practiceScore: { correct: number; total: number };
  outputSubmitted: boolean;
  xpReward: number;
  onComplete: () => void;
}) {
  const rubric = content.rubric ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">{content.summary}</p>

      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-900">Can-do target</h3>
        <p className="mt-1 text-sm font-semibold text-emerald-950">{content.can_do}</p>
      </div>

      {rubric.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Self-check rubric</h3>
          <ul className="mt-2 space-y-2">
            {rubric.map((criterion, index) => {
              const key = `${index}-${criterion}`;
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50">
                    <input type="checkbox" checked={Boolean(checked[key])} onChange={() => onToggle(key)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                    <span>{criterion}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-xl bg-slate-50 p-4">
        <p className="text-xs text-slate-600">
          Practice score {practiceScore.correct}/{practiceScore.total || '—'} · Output {outputSubmitted ? 'submitted' : 'not submitted yet'}
        </p>
        {completed ? (
          <p className="mt-2 text-sm font-semibold text-emerald-800">Lesson complete — {xpReward} XP banked. Continue to the next lesson.</p>
        ) : signedIn ? (
          <button
            type="button"
            onClick={onComplete}
            disabled={saving}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {saving ? 'Saving…' : 'Mark lesson complete'}
          </button>
        ) : (
          <a
            href={`/login?next=/curriculum/lessons/${lessonNumber}`}
            className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Sign in to save progress
          </a>
        )}
      </div>
    </div>
  );
}
