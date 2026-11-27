'use client';

import { ACTION_BUTTON_CLASS } from '@/lib/curriculum/week-tasks.mjs';
import { useEffect, useId, useRef, useState } from 'react';
import type { LearnerListening, LearnerListeningSupport } from '@/lib/curriculum/learner-week';
import PracticeItemPager from './PracticeItemPager';
import { glossCheckScore } from '@/lib/curriculum/week-input-ui.mjs';

/**
 * Before you listen: the topic intro, the predictions and the two key words.
 *
 * Replaces the old one-line predict sentence. Every part of it is optional
 * preparation: nothing here is marked, and nothing blocks the player.
 *
 * The picture shows only when the week has a real image URL. The pilot content
 * carries a brief for the illustrator ("Map of the UK with London and Inverness
 * marked…"), not an image, and the empty box helped nobody, so weeks without a
 * picture show none. The brief itself is not sent to learners.
 */
export function ListeningIntro({ support }: { support: LearnerListeningSupport }) {
  const [ideasShown, setIdeasShown] = useState(false);
  const [openWord, setOpenWord] = useState<string | null>(null);

  return (
    <section aria-labelledby="listening-intro-heading" className="space-y-4">
      <div className="space-y-2">
        <h3 id="listening-intro-heading" className="text-lg font-semibold">
          {support.intro.title}
        </h3>
        <p className="text-sm leading-6 text-stone-700">{support.intro.context}</p>
      </div>

      {support.intro.pictureUrl ? (
        <figure data-testid="listening-picture" className="overflow-hidden rounded-xl border border-stone-200">
          {/* eslint-disable-next-line @next/next/no-img-element -- a content-provided URL is not a static import */}
          <img src={support.intro.pictureUrl} alt={support.intro.title} className="w-full" />
        </figure>
      ) : null}

      <div className="rounded-xl bg-indigo-50 p-4">
        <p className="font-medium text-indigo-950">{support.intro.predict}</p>
        <button
          type="button"
          onClick={() => setIdeasShown((shown) => !shown)}
          aria-expanded={ideasShown}
          aria-controls="listening-ideas"
          className={`mt-2 ${ACTION_BUTTON_CLASS}`}
        >
          {ideasShown ? 'Hide ideas' : 'Show some ideas'}
        </button>
        {ideasShown && (
          <ul id="listening-ideas" className="mt-3 list-disc space-y-1 pl-5 text-sm text-indigo-950">
            {support.intro.ideas.map((idea) => (
              <li key={idea}>{idea}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="font-medium">Two words to know</h4>
        <ul className="mt-2 grid gap-3 sm:grid-cols-2">
          {support.keyWords.map((word) => {
            const open = openWord === word.word;
            return (
              <li key={word.word} className="rounded-xl border border-stone-200 p-4">
                <button
                  type="button"
                  onClick={() => setOpenWord(open ? null : word.word)}
                  aria-expanded={open}
                  aria-controls={`key-word-${word.word}`}
                  className="min-h-11 w-full text-left font-semibold text-indigo-800 underline decoration-indigo-300"
                >
                  {word.word}
                </button>
                {/* Hidden visually but not from assistive tech when closed is
                    wrong for a reveal: the meaning is the reward for tapping. */}
                <div id={`key-word-${word.word}`} hidden={!open} className="mt-2 space-y-1 text-sm">
                  <p className="text-stone-800">{word.meaning}</p>
                  <p lang="es" className="text-stone-600">
                    {word.es}
                  </p>
                  <p className="italic text-stone-600">{word.example}</p>
                  {word.note && <p className="text-amber-900">{word.note}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/**
 * One tap-to-open gloss.
 *
 * A real <button>, so mouse, touch, Enter and Space all work with no key
 * handlers of our own; Escape closes it and returns focus to the trigger, and the
 * popup is described to the screen reader through aria-expanded, aria-controls
 * and the popup's own text.
 *
 * The card-word variant opens a short meaning with no Spanish, because the card
 * word is already in the vocabulary step and this is a reminder, not a gloss.
 */
export function TapWord({
  label,
  meaning,
  spanish,
  kind,
}: {
  label: string;
  meaning: string;
  spanish?: string;
  kind: 'gloss' | 'card';
}) {
  const [open, setOpen] = useState(false);
  const popupId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <span className="relative inline">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        aria-controls={popupId}
        className={
          kind === 'gloss'
            ? 'min-h-11 rounded bg-amber-100 px-1 font-semibold text-amber-950 underline decoration-amber-500 decoration-dotted underline-offset-2'
            : 'min-h-11 rounded bg-emerald-100 px-1 font-semibold text-emerald-950 underline decoration-emerald-500 decoration-dotted underline-offset-2'
        }
      >
        {label}
      </button>
      {open && (
        <span
          id={popupId}
          role="dialog"
          aria-label={`Meaning of ${label}`}
          className="absolute left-0 top-full z-20 mt-1 block w-64 rounded-xl border border-stone-300 bg-white p-3 text-left text-sm shadow-lg"
        >
          <span className="block text-stone-900">{meaning}</span>
          {spanish && (
            <span lang="es" className="mt-1 block text-stone-600">
              {spanish}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/**
 * The transcript, once it is earned.
 *
 * Free replay: the player above never has a limit, so there is nothing to gate
 * here either. Glosses and card words are highlighted in two colours, and the
 * key below the text names the colours for anyone who cannot see them.
 */
export function Transcript({ support }: { support: LearnerListeningSupport }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded bg-amber-200" aria-hidden="true" />
          Tap for a meaning
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded bg-emerald-200" aria-hidden="true" />
          A word from your cards
        </span>
      </div>
      <div className="whitespace-pre-line rounded-xl bg-stone-50 p-4 text-sm leading-7">
        {support.transcript?.map((segment, index) =>
          segment.gloss ? (
            <TapWord
              key={index}
              kind="gloss"
              label={segment.text}
              meaning={support.glosses?.find((gloss) => gloss.tap === segment.gloss)?.meaning ?? ''}
              spanish={support.glosses?.find((gloss) => gloss.tap === segment.gloss)?.es}
            />
          ) : segment.card ? (
            <TapWord
              key={index}
              kind="card"
              label={segment.text}
              meaning={support.cardWords.find((word) => word.word === segment.card)?.meaning ?? ''}
            />
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </div>
      <p className="text-sm text-stone-600">Read it as often as you like.</p>
    </div>
  );
}

/**
 * The four-item gloss check ("Check four words").
 *
 * One word at a time, large option buttons, one line of feedback after each
 * answer and a short score at the end. Panels stay mounted, so moving between
 * words never loses a mark or its feedback. Marked on the server; the right
 * answer arrives only after an answer has been chosen.
 */
export function GlossCheck({
  week,
  items,
  endpoint = '/api/week/listening/gloss',
  description = 'A short check of four words from the transcript. It is not part of the listening task, so you can stop at any point.',
}: {
  week: number;
  items: { id: string; stem: string; options: string[] }[];
  endpoint?: string;
  description?: string;
}) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, { correct: boolean; answer: string; feedback: string }>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function check(id: string) {
    setError('');
    setBusy(id);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, itemId: id, answer: choice[id] }),
      });
      const data = (await response.json()) as {
        correct: boolean;
        answer: string;
        feedback: string;
        error?: string;
      };
      if (!response.ok) {
        console.error('[listening-support] check failed:', data.error ?? response.status);
        setError(data.error || 'We could not check your answer. Please try again.');
        return;
      }
      setResult((previous) => ({ ...previous, [id]: data }));
    } catch (err) {
      console.error('[listening-support] check failed:', err);
      setError('We could not check your answer. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const markedCount = Object.keys(result).length;
  const correctCount = Object.values(result).filter((entry) => entry.correct).length;
  const pages = items.map((item) => {
    const marked = result[item.id];
    return {
      id: item.id,
      content: (
        <div className="rounded-xl bg-stone-50 p-4">
          <fieldset>
            <legend className="font-medium">{item.stem}</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {item.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={choice[item.id] === option}
                  disabled={busy === item.id || Boolean(marked)}
                  onClick={() => {
                    setChoice((previous) => ({ ...previous, [item.id]: option }));
                    setResult((previous) => {
                      const next = { ...previous };
                      delete next[item.id];
                      return next;
                    });
                  }}
                  className={`min-h-14 rounded-xl border-2 px-3 py-3 text-left text-base font-medium disabled:opacity-50 ${
                    choice[item.id] === option
                      ? 'border-indigo-700 bg-indigo-700 text-white'
                      : 'border-stone-300 bg-white text-stone-900'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            disabled={!choice[item.id] || busy === item.id || Boolean(marked)}
            onClick={() => check(item.id)}
            className={`mt-3 ${ACTION_BUTTON_CLASS}`}
          >
            {busy === item.id ? 'Checking…' : 'Check'}
          </button>
          {marked && (
            <div role="status" className={marked.correct ? 'mt-2 text-sm text-emerald-800' : 'mt-2 text-sm text-amber-900'}>
              <strong>{marked.correct ? 'Correct. ' : `Not quite. The answer is "${marked.answer}". `}</strong>
              {marked.feedback}
            </div>
          )}
        </div>
      ),
    };
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">{description}</p>
      <PracticeItemPager
        label="Check four words"
        unit="Word"
        nextLabel="Next"
        showPrevious={false}
        items={pages}
        initiallyAnswered={{}}
      />
      {items.length > 0 && markedCount === items.length && (
        <p role="status" className="rounded-xl bg-indigo-50 p-4 font-semibold text-indigo-950">
          {glossCheckScore(correctCount, items.length)}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Everything above the player: the topic intro, the prediction and the two key
 * words. Always shown, signed in or not -- it is preparation, not a reward.
 */
export function ListeningBeforePlayer({ support }: { support: LearnerListeningSupport | null }) {
  if (!support) return null;
  return <ListeningIntro support={support} />;
}

/**
 * Everything below the questions: the transcript gate, then "Go further".
 *
 * The transcript appears only once `listening.support.transcript` has been sent,
 * which the server only does after every listening question has a saved answer.
 * Until then the learner sees how many are left and a link to them, not a
 * disabled copy of the text.
 */
export function ListeningAfterQuestions({
  week,
  listening,
}: {
  week: number;
  listening: LearnerListening;
}) {
  const { support, answered, total, transcriptUnlocked } = listening;
  if (!support) return null;

  return (
    <div className="space-y-8">
      <section aria-labelledby="transcript-heading" className="space-y-3">
        <h3 id="transcript-heading" className="text-lg font-semibold">
          Transcript
        </h3>
        {transcriptUnlocked ? (
          <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950">
            Your transcript is open. Read it below in <em>Go further</em>, as often as you like.
          </p>
        ) : (
          <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-700">
            Answer the listening questions first, then the transcript appears here. You have answered{' '}
            <strong>
              {answered} of {total}
            </strong>
            .{' '}
            <a href="#listening-questions" className="text-indigo-700 underline">
              Go to the questions
            </a>
          </p>
        )}
      </section>

      <details className="rounded-xl border border-stone-200 p-5">
        <summary className="cursor-pointer text-lg font-semibold">Go further (3–4 min)</summary>
        <div className="mt-4 space-y-6">
          <p className="text-sm text-stone-600">
            Extra practice with the transcript. It is here to help, not to mark: finishing the listening
            questions completes the listening task.
          </p>
          {transcriptUnlocked ? (
            <>
              <Transcript support={support} />
              <section aria-labelledby="gloss-check-heading" className="space-y-3">
                <h3 id="gloss-check-heading" className="text-lg font-semibold">
                  Check four words
                </h3>
                <GlossCheck week={week} items={support.glossCheck ?? []} />
              </section>
            </>
          ) : (
            <p className="text-sm text-stone-700">
              The transcript and the gloss check open once you have answered the listening questions.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
