'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CheckSquare, Flame, Headphones, Mic, Target } from 'lucide-react';
import ListeningInputCard from '@/components/b1b2/ListeningInputCard';
import MondayVocabPack from '@/components/b1b2/MondayVocabPack';
import OutputStudio from '@/components/b1b2/OutputStudio';
import PracticeQuiz from '@/components/b1b2/PracticeQuiz';
import WarmUpDeck from '@/components/b1b2/WarmUpDeck';
import type {
  BlockKind,
  FeedbackContent,
  InputContent,
  LessonPayload,
  OutputContent,
  PracticeContent,
  WarmUpContent,
} from '@/lib/b1b2/types';

const BLOCK_META: Record<BlockKind, { label: string; accent: string; icon: typeof Flame }> = {
  warm_up: { label: 'Warm-up', accent: 'bg-amber-100 text-amber-900', icon: Flame },
  input: { label: 'Input', accent: 'bg-sky-100 text-sky-900', icon: Headphones },
  practice: { label: 'Practice', accent: 'bg-indigo-100 text-indigo-900', icon: CheckSquare },
  output: { label: 'Output', accent: 'bg-rose-100 text-rose-900', icon: Mic },
  feedback: { label: 'Feedback', accent: 'bg-emerald-100 text-emerald-900', icon: Target },
};

export default function LessonRunner({ payload, signedIn }: { payload: LessonPayload; signedIn: boolean }) {
  const router = useRouter();
  const { lesson, module, blocks, items, progress, personal_error_log: personalErrorLog = [] } = payload;

  const [practiceScore, setPracticeScore] = useState({
    correct: progress?.practice_correct ?? 0,
    total: progress?.practice_total || items.length,
  });
  const [outputSubmitted, setOutputSubmitted] = useState(Boolean(progress?.output_submitted));
  const [rubricChecked, setRubricChecked] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState(progress?.status === 'completed');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const orderedBlocks = useMemo(() => [...blocks].sort((a, b) => a.sort_order - b.sort_order), [blocks]);
  const outputGateBlocked = Boolean(lesson.output_required) && !outputSubmitted;

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
        const meta = BLOCK_META[block.block_kind] ?? {
          label: block.block_kind,
          accent: 'bg-stone-100 text-stone-700',
          icon: Target,
        };
        const BlockIcon = meta.icon;
        return (
          <section
            key={block.id}
            id={`block-${block.block_kind}`}
            aria-label={`${meta.label} block`}
            className="scroll-mt-24 rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${meta.accent}`}>
                  <BlockIcon className="h-3.5 w-3.5" />
                  <span>{meta.label}</span>
                </span>
                <h2 className="font-serif text-lg font-semibold text-stone-900">{block.title}</h2>
              </div>
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-500">
                ~{block.minutes} min
              </span>
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
                <InputSection
                  content={block.content as InputContent}
                  payload={payload}
                  signedIn={signedIn}
                  personalErrorLog={personalErrorLog}
                />
              )}

              {block.block_kind === 'practice' && (
                <PracticeSection
                  content={block.content as PracticeContent}
                  items={items}
                  onScoreChange={(correct, total) => setPracticeScore({ correct, total })}
                  signedIn={signedIn}
                  lessonNumber={lesson.lesson_number}
                  lessonId={lesson.id}
                  grammarPoint={lesson.grammar_point}
                />
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
                  outputGateBlocked={outputGateBlocked}
                  xpReward={lesson.xp_reward}
                  onComplete={markComplete}
                />
              )}
            </div>
          </section>
        );
      })}

      {error && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </p>
      )}

      <p className="text-center text-xs text-stone-500">
        Week {module.week_number ?? module.number} · {module.title} · {lesson.day_of_week ?? `Day ${lesson.module_lesson_number}`} ({lesson.module_lesson_number} of 7)
      </p>
    </div>
  );
}

function WarmUpSection({ content, lessonNumber, signedIn }: { content: WarmUpContent; lessonNumber: number; signedIn: boolean }) {
  return (
    <>
      <p className="text-sm text-stone-700">{content.summary}</p>
      <div className="mt-3">
        <WarmUpDeck
          lessonNumber={lessonNumber}
          signedIn={signedIn}
          cardCount={content.card_count ?? 8}
          reviewLadderDays={content.review_ladder_days ?? [1, 3, 7, 14, 30]}
        />
      </div>
    </>
  );
}

function InputSection({
  content,
  payload,
  signedIn,
  personalErrorLog = [],
}: {
  content: InputContent;
  payload: LessonPayload;
  signedIn: boolean;
  personalErrorLog?: LessonPayload['personal_error_log'];
}) {
  const input = payload.input;
  const isWeek16 = (payload.module.week_number ?? payload.module.number) === 16;
  const vocabItems = payload.vocab_items ?? [];
  const vocabPack = payload.module.vocab_pack ?? null;
  const hasMondayPack =
    payload.lesson.module_lesson_number === 1 &&
    (vocabItems.length > 0 ||
      Boolean(vocabPack?.collocations?.length || vocabPack?.wordFamilies?.length || vocabPack?.linkingExpressions?.length));

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-700">
        {hasMondayPack ? payload.lesson.objective : content.summary}
      </p>

      {isWeek16 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-amber-900">
              Week 16 Personal Error-Log Targets
            </h3>
            <div className="flex gap-3 text-xs font-semibold">
              <Link href="/clinic" className="text-indigo-700 hover:underline">
                Grammar Clinic →
              </Link>
              <Link href="/review" className="text-indigo-700 hover:underline">
                Full review deck →
              </Link>
            </div>
          </div>
          {personalErrorLog && personalErrorLog.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {personalErrorLog.map((item) => (
                <li key={item.id} className="rounded-lg bg-white p-3 text-xs ring-1 ring-amber-200/80">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                      {item.category.replace(/_/g, ' ')} · {item.occurrence_count}×
                    </span>
                    <span className="text-[11px] font-semibold text-stone-500">
                      {item.mastered ? 'Mastered' : 'Needs repair'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-rose-700 line-through">{item.incorrect_sentence}</p>
                  <p className="mt-0.5 font-semibold text-emerald-800">{item.target_sentence}</p>
                  {item.explanation && <p className="mt-1 text-stone-600">{item.explanation}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-stone-600">
              Your Week 16 grammar focus automatically pulls your top recurring speaking and writing mistakes once logged. Practise B1 basics anytime in the{' '}
              <Link href="/clinic" className="font-semibold text-indigo-700 hover:underline">
                Grammar Clinic
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {hasMondayPack ? (
        <MondayVocabPack
          vocabItems={vocabItems}
          vocabPack={vocabPack}
          signedIn={signedIn}
          lessonNumber={payload.lesson.lesson_number}
        />
      ) : (
        <>
          {input && <ListeningInputCard input={input} />}

          {content.key_points?.length ? (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-stone-600">Key points</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-stone-700">
                {content.key_points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {content.model_example && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-stone-600">Model example</h3>
              <p className="mt-2 rounded-lg border-l-4 border-indigo-400 bg-indigo-50/50 p-3 text-sm italic leading-6 text-stone-700">
                {content.model_example}
              </p>
            </div>
          )}
        </>
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
  lessonId,
  grammarPoint,
}: {
  content: PracticeContent;
  items: LessonPayload['items'];
  onScoreChange: (correct: number, total: number) => void;
  signedIn: boolean;
  lessonNumber: number;
  lessonId: string;
  grammarPoint: string | null;
}) {
  return (
    <div>
      <p className="text-sm text-stone-700">{content.summary}</p>
      <p className="mt-1 text-xs text-stone-500">
        {content.item_count} items
        {content.mix?.grammar ? ` · ${content.mix.grammar} grammar` : ''}
        {content.mix?.vocabulary ? ` · ${content.mix.vocabulary} vocabulary` : ''}
        {content.answer_mode ? ` · ${content.answer_mode.replace(/_/g, ' ')}` : ''}
      </p>

      {items.length ? (
        <PracticeQuiz
          lessonId={lessonId}
          signedIn={signedIn}
          grammarPoint={grammarPoint}
          items={items.map((item) => ({
            id: item.id,
            kind: item.kind,
            prompt: item.prompt,
            options: item.options,
            answer: item.answer,
            explanation: item.explanation,
          }))}
          onScoreChange={onScoreChange}
        />
      ) : (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
          <p>Practice items and answer keys unlock when you sign in.</p>
          <Link
            href={`/login?next=/curriculum/lessons/${lessonNumber}`}
            className="mt-2 inline-block rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
          >
            {signedIn ? 'Reload after signing in' : 'Sign in to practise'}
          </Link>
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
      <p className="text-sm text-stone-700">{content.summary}</p>
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
  outputGateBlocked,
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
  outputGateBlocked: boolean;
  xpReward: number;
  onComplete: () => void;
}) {
  const rubric = content.rubric ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-700">{content.summary}</p>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-900">Can-do target</h3>
        <p className="mt-1 text-sm font-semibold text-emerald-950">{content.can_do}</p>
      </div>

      {rubric.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-stone-600">Self-check rubric</h3>
          <ul className="mt-2 space-y-2">
            {rubric.map((criterion, index) => {
              const key = `${index}-${criterion}`;
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-700 hover:bg-stone-50">
                    <input
                      type="checkbox"
                      checked={Boolean(checked[key])}
                      onChange={() => onToggle(key)}
                      className="mt-0.5 h-4 w-4 accent-emerald-600"
                    />
                    <span>{criterion}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-xs text-stone-600">
          Practice score {practiceScore.correct}/{practiceScore.total || '—'} · Output {outputSubmitted ? 'evaluated' : 'not evaluated yet'}
        </p>
        {outputGateBlocked && !completed && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950">
            Output before progress: this is a required speaking or writing session. Submit your evaluated output in Block 4 above before marking this session complete.
          </p>
        )}
        {completed ? (
          <p className="mt-2 text-sm font-semibold text-emerald-800">
            Session complete — {xpReward} XP banked. Continue to the next session.
          </p>
        ) : signedIn ? (
          <button
            type="button"
            onClick={onComplete}
            disabled={saving || outputGateBlocked}
            className="mt-3 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:bg-stone-300"
          >
            {saving ? 'Saving…' : 'Mark session complete'}
          </button>
        ) : (
          <Link
            href={`/login?next=/curriculum/lessons/${lessonNumber}`}
            className="mt-3 inline-block rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
          >
            Sign in to save progress
          </Link>
        )}
      </div>
    </div>
  );
}
