'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ACTION_BUTTON_CLASS } from '@/lib/curriculum/week-tasks.mjs';
import SpeakingModelPlayer from './SpeakingModelPlayer';
import SpeakingFeedbackDetails, { RecordButton } from './SpeakingFeedbackDetails';
import ImprovedAnswerCard from './ImprovedAnswerCard';
import { OptionalPart1Questions, OptionalPart3And4 } from './WeekSpeakingParts';
import WeekSpeakingRecordings, { type WeekSpeakingRecordingLink } from './WeekSpeakingRecordings';
import { phrasesUsed, splitHighlightedText } from '@/lib/curriculum/speaking-support.mjs';
import type { SpeakingParts } from '@/lib/curriculum/details';
import type { ModelPart, WeekTake } from '@/lib/curriculum/week-speaking-support';

type Model = { text: string; audioUrl: string | null; parts: ModelPart[] };
type Props = {
  week: number;
  prompt: string;
  cueCard: string;
  signedIn: boolean;
  available: boolean;
  weekRecorded: boolean | null;
  planNotes: string[];
  usefulPhrases: string[];
  retryGoal: string;
  initialNotes: { label: string; note: string }[] | null;
  first: WeekTake | null;
  tries: WeekTake[];
  firstVersions: number;
  retryCount: number;
  checksUsed: number;
  pending: boolean;
  recordings: WeekSpeakingRecordingLink[];
  model: Model | null;
  speakingParts?: SpeakingParts | null;
};
type PracticeResult = { transcript: string; used: boolean };

function Transcript({ text, phrases }: { text: string; phrases: string[] }) {
  return (
    <p className="whitespace-pre-line text-sm leading-7 text-stone-800">
      {splitHighlightedText(text, phrases).map((part, i) =>
        part.highlighted ? (
          <mark key={i} className="rounded bg-amber-200 px-0.5">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

function Comparison({
  before,
  after,
  phrases,
}: {
  before: WeekTake;
  after: WeekTake;
  phrases: string[];
}) {
  const listPhrases = (take: WeekTake) => {
    if (!take.transcript) return 'not available';
    const used = phrasesUsed(take.transcript, phrases);
    return used.length ? used.join(' · ') : 'none found';
  };
  const seconds = (take: WeekTake) =>
    typeof take.feedback?.fluency?.seconds === 'number'
      ? `${take.feedback.fluency.seconds} seconds`
      : 'not available';
  const points = (take: WeekTake) =>
    Array.isArray(take.feedback?.cuePoints)
      ? take.feedback.cuePoints.map((item) => item.label).join(' · ') || 'none found'
      : 'not available';
  return (
    <div
      className="space-y-1 rounded-lg bg-indigo-50 p-3 text-sm"
      aria-label={`Compare try ${after.sequence} with the previous recording`}
    >
      <p className="font-semibold">Compared with your previous recording</p>
      <p>
        <strong>Phrases found:</strong> {listPhrases(before)} → {listPhrases(after)}
      </p>
      <p>
        <strong>Time:</strong> {seconds(before)} → {seconds(after)}
      </p>
      <p>
        <strong>Cue-card points found:</strong> {points(before)} → {points(after)}
      </p>
      <p className="text-sm text-stone-600">
        Points are based on words found in the transcripts, not a mark.
      </p>
    </div>
  );
}

function AnotherExampleBlock({
  model,
  usefulPhrases,
  expandedFirst,
  promptMessage,
}: {
  model: Model;
  usefulPhrases: string[];
  expandedFirst: boolean;
  promptMessage?: string | null;
}) {
  const [scriptShown, setScriptShown] = useState(false);

  const inner = (
    <div className="space-y-3 pt-2">
      {promptMessage && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
          {promptMessage}
        </p>
      )}
      <SpeakingModelPlayer text={model.text.replace(/^>\s*/, '')} audioUrl={model.audioUrl} />
      <button
        type="button"
        onClick={() => setScriptShown((shown) => !shown)}
        aria-expanded={scriptShown}
        aria-controls="speaking-model-script"
        className="min-h-11 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-950"
      >
        {scriptShown ? 'Hide the script' : 'Show the script'}
      </button>
      {scriptShown && (
        <div
          id="speaking-model-script"
          className="space-y-3 rounded-xl bg-white p-4"
          aria-label="Model script with cue points and purposes"
        >
          <h4 className="font-semibold">Model script</h4>
          {model.parts.map((part, index) => (
            <div key={`${index}:${part.text}`} className="border-l-2 border-emerald-200 pl-3">
              <p className="text-sm font-semibold text-emerald-800">
                {part.cuePoints.join(' · ')} — {part.purpose}
              </p>
              <Transcript text={part.text} phrases={usefulPhrases} />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (expandedFirst) {
    return (
      <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <h4 className="font-semibold text-emerald-950">Another example</h4>
        {inner}
      </div>
    );
  }

  return (
    <details className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-emerald-950">
        Another example
      </summary>
      {inner}
    </details>
  );
}

export default function WeekSpeakingSupport(props: Props) {
  const {
    week,
    prompt,
    cueCard,
    signedIn,
    planNotes,
    usefulPhrases,
    first,
    tries,
    model,
    speakingParts = null,
  } = props;
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries((props.initialNotes ?? []).map((item) => [item.label, item.note])),
  );
  const [selected, setSelected] = useState<[string, string]>(() => {
    const saved = props.tries.at(-1)?.selectedPhrases ?? [];
    return [saved[0] ?? '', saved[1] ?? ''];
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const checksRemaining = Math.max(0, 5 - props.checksUsed);
  const blocked = busy || props.pending || !signedIn || !props.available;

  const firstHighlights = first?.feedback?.highlights ?? [];
  const takeWithYouChoices: Array<{ value: string; label: string }> =
    firstHighlights.length > 0
      ? firstHighlights.map((h) => ({
          value: h.substring,
          label: `${h.substring} (${h.label})`,
        }))
      : usefulPhrases.map((phrase) => ({ value: phrase, label: phrase }));
  const comparisonPhrases =
    firstHighlights.length > 0 ? firstHighlights.map((h) => h.substring) : usefulPhrases;

  async function check(takeId: string) {
    const response = await fetch('/api/week/speaking/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ takeId }),
    });
    const data = (await response.json()) as {
      error?: string;
      transcript?: string;
      used?: boolean;
    };
    if (!response.ok) throw new Error(data.error || 'We could not check your recording.');
    return data;
  }

  async function save(
    blob: Blob,
    kind: 'first' | 'retry' | 'structure',
    sourceTakeId?: string,
  ): Promise<PracticeResult | null> {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('audio', blob, `week-${week}.webm`);
      form.set('weekNumber', String(week));
      form.set('kind', kind);
      form.set(
        'notes',
        JSON.stringify(
          kind === 'first'
            ? planNotes.map((label) => ({ label, note: notes[label] ?? '' }))
            : [],
        ),
      );
      form.set('phrases', JSON.stringify(kind === 'retry' ? selected.filter(Boolean) : []));
      if (sourceTakeId) form.set('sourceTakeId', sourceTakeId);
      const response = await fetch('/api/week/speaking/capture', { method: 'POST', body: form });
      const data = (await response.json()) as { takeId?: string; error?: string };
      if (!response.ok || !data.takeId) {
        throw new Error(data.error || 'We could not save your recording.');
      }
      if (kind !== 'first') {
        const checked = await check(data.takeId);
        if (kind === 'structure' && checked.transcript && typeof checked.used === 'boolean') {
          return { transcript: checked.transcript, used: checked.used };
        }
      }
      return null;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'We could not save your recording.';
      if (kind === 'structure') throw new Error(message);
      setError(message);
      return null;
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function checkSaved(takeId: string): Promise<PracticeResult> {
    setBusy(true);
    setError('');
    try {
      const result = await check(takeId);
      return { transcript: result.transcript ?? '', used: result.used === true };
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function checkMain(takeId: string) {
    try {
      await checkSaved(takeId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not check your recording.');
    }
  }

  const canPractise = (take: WeekTake) => Boolean(take.id && checksRemaining > 0 && !blocked);
  const details = (take: WeekTake, showImprovedInline = false) =>
    take.feedback && (
      <>
        {!take.id && <p className="text-sm text-stone-600">Scores for older recordings used a different method and are not shown here.</p>}
        <SpeakingFeedbackDetails
          key={take.id ?? `legacy-${take.sequence}`}
          feedback={take.feedback}
          practice={take.practice}
          practiceAllowed={canPractise(take)}
          practiceUnavailableMessage={
            !take.id
              ? 'Extra sentence practice is not available for an older recording.'
              : checksRemaining === 0
                ? 'No weekly checks remain for this extra practice.'
                : 'Wait until the current recording or check has finished.'
          }
          onPractice={
            take.id
              ? async (blob) => {
                  const result = await save(blob, 'structure', take.id ?? undefined);
                  if (!result) throw new Error('We could not check this sentence.');
                  return result;
                }
              : undefined
          }
          onRecheckPractice={checkSaved}
          showImprovedInline={showImprovedInline}
          ttsKind="take"
          ttsId={take.id}
        />
      </>
    );

  const lastTry = tries.at(-1);
  const needsCheck = lastTry?.status === 'ready' || lastTry?.status === 'checking';
  const chosen = selected.filter(Boolean);
  const showExampleFirst = Boolean(first?.feedback?.showExampleFirst);
  const improvedResponse = first?.feedback?.improvedResponse;

  return (
    <section
      id="speaking-practice"
      className="space-y-5 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm target:scroll-mt-20"
      aria-labelledby="week-speaking-title"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
          Week {week} · speaking (4 parts · only the long turn is required to finish the week)
        </p>
        <h2 id="week-speaking-title" tabIndex={-1} className="mt-1 text-xl font-semibold">
          Plan, record and improve
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-700">{prompt}</p>
      </div>

      {speakingParts && (
        <OptionalPart1Questions week={week} questions={speakingParts.questionsAboutYou} />
      )}

      <div className="space-y-4 rounded-2xl border border-indigo-100 bg-white p-1 sm:p-2">
        <p className="px-2 text-xs font-bold uppercase tracking-wider text-indigo-800">
          Part 2 · Long turn · 60–90 seconds (counts for Week {week})
        </p>

        <section aria-labelledby="speaking-plan-title" className="space-y-3 rounded-xl bg-indigo-50 p-4">
          <h3 id="speaking-plan-title" className="font-semibold">
            1. Plan · about 2 minutes
          </h3>
          <p className="text-sm">
            Cue card: <strong>{cueCard}</strong>
          </p>
          <p className="text-sm text-stone-600">
            Write a few key words. Your improved answer unlocks once you keep and check your first recording.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {planNotes.map((label) => (
              <label key={label} className="space-y-1 text-sm font-medium">
                <span>{label}</span>
                <textarea
                  value={notes[label] ?? ''}
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [label]: event.target.value }))
                  }
                  maxLength={600}
                  rows={2}
                  className="w-full rounded-lg border border-indigo-200 bg-white p-2 font-normal"
                  aria-label={`Notes for ${label}`}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-stone-200 p-4">
          <h3 className="font-semibold">2. Record · 60–90 seconds</h3>
          <p className="text-sm text-stone-600">
            Listen to your recording and, if you like, record again up to twice. Only the version you keep is checked and counts for the week.
          </p>
          <p className="text-sm text-stone-600">
            There are five checks in total for this weekly task. A first check or later try uses one; “Say it again” also uses one. Saving first versions uses none.
          </p>
          {!signedIn && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm">
              Sign in to save your notes and recordings.{' '}
              <Link href="/login" className="font-semibold text-indigo-700 underline">
                Sign in
              </Link>
            </p>
          )}
          {!props.available && (
            <p role="alert" className="text-sm text-rose-700">
              Saved speaking practice is temporarily unavailable. Please try again later.
            </p>
          )}
          {props.pending && (
            <p className="text-sm">
              A recording is being saved or checked. Refresh in a moment. If it stays stuck, try again after 30 minutes.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          )}
          {!model && (
            <div className="flex flex-wrap gap-2">
              <RecordButton
                label={
                  first
                    ? `Record again (${Math.max(0, 3 - props.firstVersions)} left)`
                    : 'Start recording'
                }
                disabled={blocked || props.firstVersions >= 3 || !checksRemaining}
                onRecorded={(blob) => void save(blob, 'first')}
              />
              {first?.id && ['ready', 'checking'].includes(first.status) && (
                <button
                  type="button"
                  disabled={blocked || !checksRemaining}
                  onClick={() => void checkMain(first.id!)}
                  className={ACTION_BUTTON_CLASS}
                >
                  {busy ? 'Checking…' : 'Keep and check this recording'}
                </button>
              )}
            </div>
          )}
          {!model && first && (
            <p className="text-sm">
              First recording version {props.firstVersions} of 3 is ready to keep.
            </p>
          )}
          {!model && checksRemaining === 0 && (
            <p className="text-sm">
              You have used all five checks. This recording cannot be checked or counted.
            </p>
          )}
          {model && first && (
            <div className="space-y-3">
              {props.weekRecorded === true ? (
                <p className="font-semibold text-emerald-800">
                  Your kept first recording counts for Week {week}.
                </p>
              ) : props.weekRecorded === false ? (
                <p className="font-semibold text-amber-800">Your first recording is saved, but it has not been counted for this week. Please contact your teacher.</p>
              ) : (
                <p className="text-sm">
                  We could not check whether this recording counts. Please refresh the page.
                </p>
              )}
              {details(first, false)}
            </div>
          )}
          <p className="text-sm text-stone-600">{props.checksUsed} of 5 weekly checks used.</p>
          <WeekSpeakingRecordings recordings={props.recordings} />
        </section>

        {model && (
          <section className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4">
            <h3 className="font-semibold">3. Your answer, improved</h3>
            {showExampleFirst ? (
              <>
                <AnotherExampleBlock
                  model={model}
                  usefulPhrases={usefulPhrases}
                  expandedFirst
                  promptMessage={
                    first?.feedback?.examplePromptMessage ||
                    'Try again using this example to help you.'
                  }
                />
                {improvedResponse && (
                  <ImprovedAnswerCard
                    improvedResponse={improvedResponse}
                    highlights={firstHighlights}
                    ttsKind="take"
                    ttsId={first?.id ?? null}
                  />
                )}
              </>
            ) : (
              <>
                {improvedResponse ? (
                  <ImprovedAnswerCard
                    improvedResponse={improvedResponse}
                    highlights={firstHighlights}
                    ttsKind="take"
                    ttsId={first?.id ?? null}
                  />
                ) : null}
                <AnotherExampleBlock
                  model={model}
                  usefulPhrases={usefulPhrases}
                  expandedFirst={!improvedResponse}
                />
              </>
            )}
          </section>
        )}

        {model && (
          <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <h3 className="font-semibold">4. Try again · optional</h3>
            <p className="text-sm">
              {props.retryGoal} You can make up to three tries while checks remain.
            </p>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-stone-900">Take with you</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {([0, 1] as const).map((index) => (
                  <label key={index} className="space-y-1 text-sm font-medium">
                    <span>Structure {index + 1} (optional)</span>
                    <select
                      value={selected[index]}
                      onChange={(event) =>
                        setSelected((current) =>
                          index === 0
                            ? [event.target.value, current[1]]
                            : [current[0], event.target.value],
                        )
                      }
                      className="w-full rounded-lg border border-amber-300 bg-white p-2"
                    >
                      <option value="">Choose a structure</option>
                      {takeWithYouChoices.map((choice) => (
                        <option
                          key={choice.value}
                          value={choice.value}
                          disabled={selected[index === 0 ? 1 : 0] === choice.value}
                        >
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <div
              className="rounded-lg border border-amber-300 bg-white p-3 text-sm"
              aria-label="Take with you card"
            >
              <p className="font-semibold">Take with you</p>
              <p>
                {chosen.length
                  ? chosen.join(' · ')
                  : 'Choose up to two structures from your improved answer to keep them here while you record.'}
              </p>
            </div>
            {needsCheck && lastTry?.id ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={blocked || !checksRemaining}
                  onClick={() => void checkMain(lastTry.id!)}
                  className={ACTION_BUTTON_CLASS}
                >
                  Check your saved try
                </button>
                {lastTry.canMoveOn && props.retryCount < 3 && checksRemaining > 0 && (
                  <>
                    <p className="text-sm">
                      The check failed. You can check this recording again, or record the next try. The unchecked recording stays saved.
                    </p>
                    <RecordButton
                      label={`Record try ${props.retryCount + 1}`}
                      disabled={blocked}
                      onRecorded={(blob) => void save(blob, 'retry', first?.id ?? undefined)}
                    />
                  </>
                )}
                {!checksRemaining && (
                  <p className="text-sm">You have used all five checks for this task.</p>
                )}
              </div>
            ) : props.retryCount < 3 && checksRemaining > 0 ? (
              <RecordButton
                label={`Record try ${props.retryCount + 1}`}
                disabled={blocked}
                onRecorded={(blob) => void save(blob, 'retry', first?.id ?? undefined)}
              />
            ) : (
              <p className="text-sm">
                {checksRemaining === 0
                  ? 'You have used all five checks for this task.'
                  : 'You have recorded all three tries.'}
              </p>
            )}
            {tries.map((take, index) => (
              <article key={take.id ?? `legacy-${index}`} className="space-y-3 rounded-lg bg-white p-4">
                <h4 className="font-semibold">Try {take.sequence}</h4>
                {take.status !== 'checked' && (
                  <p className="text-sm">This saved recording has not been checked yet.</p>
                )}
                {take.feedback && details(take, true)}
                {index === 0
                  ? first && (
                      <Comparison before={first} after={take} phrases={comparisonPhrases} />
                    )
                  : (
                      <Comparison
                        before={tries[index - 1]}
                        after={take}
                        phrases={comparisonPhrases}
                      />
                    )}
              </article>
            ))}
          </section>
        )}
      </div>

      {speakingParts && (
        <OptionalPart3And4
          week={week}
          parts={speakingParts}
          usefulPhrases={usefulPhrases}
        />
      )}
    </section>
  );
}
