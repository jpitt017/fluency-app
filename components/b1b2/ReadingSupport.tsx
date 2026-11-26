'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { GlossCheck, TapWord } from '@/components/b1b2/ListeningSupport';
import type { LearnerReadingSupport, LearnerReading } from '@/lib/curriculum/learner-week';
import {
  READING_TEXT_BUTTON_CLASS,
  READING_TEXT_INNER_CLASS,
  readingTextPanelClass,
} from '@/lib/curriculum/week-input-ui.mjs';

/**
 * Before reading: the context line and the two key words, and nothing else.
 *
 * The old predict prompt stays in the teacher's JSON and on the teacher page;
 * it is deliberately not part of the learner's projection. The amber/green key
 * belongs beside the text, where the tap words are, and is rendered by
 * ReadingPracticeLayout.
 */
export function ReadingBeforeQuestions({ support }: { support: LearnerReadingSupport | null }) {
  if (!support) return null;
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-stone-700">{support.context}</p>
      <section aria-labelledby="reading-key-words-heading">
        <h3 id="reading-key-words-heading" className="font-semibold">Two words to know</h3>
        <ul className="mt-2 grid gap-3 sm:grid-cols-2">
          {support.keyWords.map((word) => (
            <li key={word.word} className="rounded-xl border border-stone-200 p-4">
              <p className="font-semibold text-indigo-800">{word.word}</p>
              <p className="mt-1 text-sm text-stone-800">{word.meaning}</p>
              <p lang="es" className="text-sm text-stone-600">{word.es}</p>
              <p className="mt-1 text-sm italic text-stone-600">{word.example}</p>
              {word.note && <p className="mt-1 text-sm text-amber-900">{word.note}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Reading layout: the text stays in view beside the questions on a computer;
 * on a phone a fixed "Show the text" button opens it in a panel over the
 * question and closes it again.
 *
 * One text node is rendered, never two copies: on a wide screen CSS makes it the
 * left (sticky) column, and on a narrow screen the same node is a fixed dialog.
 * The dialog is a real focusable, Escape-closable region; the fixed button is
 * shown only while the reading section is on screen, so it cannot overlap the
 * listening player's bottom bar further down the page.
 */
export function ReadingPracticeLayout({
  before,
  text,
  questions,
  after,
}: {
  before: ReactNode;
  text: ReactNode;
  questions: ReactNode;
  after: ReactNode;
}) {
  const [textOpen, setTextOpen] = useState(false);
  const [inView, setInView] = useState(true);
  const questionColumnRef = useRef<HTMLDivElement | null>(null);
  const showButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  // Watch the question column, not the whole section: the fixed button belongs
  // to the questions and must disappear once "Go further" or the listening
  // player is on screen.
  useEffect(() => {
    const node = questionColumnRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
      // Leaving the reading section closes the overlay and hides its fixed
      // button, so neither can cover the listening player further down.
      if (!entry.isIntersecting) setTextOpen(false);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A desktop visit must never inherit a phone-sized overlay dialog.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = () => { if (query.matches) setTextOpen(false); };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (!textOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [textOpen]);

  function close() {
    setTextOpen(false);
    // The trigger is re-rendered (it is absent while the overlay is open), so
    // return focus on the next frame rather than focusing a hidden/stale node.
    requestAnimationFrame(() => showButtonRef.current?.focus());
  }

  return (
    <div className="space-y-4">
      {before}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <section
          id={panelId}
          role={textOpen ? 'dialog' : undefined}
          aria-modal={textOpen ? true : undefined}
          aria-label={textOpen ? 'Reading text' : undefined}
          data-testid="reading-text-panel"
          className={readingTextPanelClass(textOpen)}
        >
          {textOpen && (
            <div className="sticky top-0 z-10 flex justify-end bg-white pb-3 lg:hidden">
              <button
                ref={closeButtonRef}
                type="button"
                onClick={close}
                className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 py-2 font-semibold"
              >
                Close the text
              </button>
            </div>
          )}
          <div className={READING_TEXT_INNER_CLASS}>
            <h3 className="sr-only">Reading text</h3>
            <div className="space-y-3">{text}</div>
            <p className="mt-3 text-xs text-stone-600">Amber words open a meaning and Spanish translation. Green words come from your vocabulary cards.</p>
          </div>
        </section>
        <div ref={questionColumnRef} className="min-w-0 pb-24 lg:pb-0" data-testid="reading-question-column">
          {questions}
        </div>
      </div>
      {inView && !textOpen && (
        <button
          ref={showButtonRef}
          type="button"
          onClick={() => setTextOpen(true)}
          aria-expanded={textOpen}
          aria-controls={panelId}
          data-testid="show-reading-text"
          className={READING_TEXT_BUTTON_CLASS}
        >
          Show the text
        </button>
      )}
      {after}
    </div>
  );
}

export function ReadingText({ support }: { support: LearnerReadingSupport | null }) {
  if (!support) return null;
  const glossByWord = new Map(support.glosses.map((gloss) => [gloss.tap.toLowerCase(), gloss]));
  const cardByWord = new Map(support.cardWords.map((card) => [card.word.toLowerCase(), card]));
  return (
    <p className="whitespace-pre-line leading-7">
      {support.text.map((segment, index) => {
        if (segment.gloss) {
          const gloss = glossByWord.get(segment.gloss.toLowerCase());
          return <TapWord key={index} kind="gloss" label={segment.text} meaning={gloss?.meaning ?? ''} spanish={gloss?.es} />;
        }
        if (segment.card) {
          const card = cardByWord.get(segment.card.toLowerCase());
          if (card?.meaning) return <TapWord key={index} kind="card" label={segment.text} meaning={card.meaning} />;
          return <span key={index} className="rounded bg-emerald-100 px-1 font-semibold text-emerald-950 underline decoration-emerald-500 decoration-dotted underline-offset-2">{segment.text}</span>;
        }
        return <span key={index}>{segment.text}</span>;
      })}
    </p>
  );
}

export function ReadingAfterQuestions({ week, reading }: { week: number; reading: LearnerReading }) {
  const support = reading.support;
  if (!support) return null;
  return (
    <details className="rounded-xl border border-stone-200 p-5">
      <summary className="cursor-pointer text-lg font-semibold">Go further (2–3 min)</summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-stone-600">An optional check of the key words. It does not count towards unlocking another week.</p>
        {reading.questionsAnswered ? (
          <>
            <p className="text-sm text-emerald-900">Your reading answers are saved. Card-word meanings are now open in the text.</p>
            <section aria-labelledby="reading-gloss-check-heading" className="space-y-3">
              <h3 id="reading-gloss-check-heading" className="text-lg font-semibold">Check four words</h3>
              <GlossCheck
                week={week}
                items={support.glossCheck ?? []}
                endpoint="/api/week/reading/gloss"
                description="A short check of words from the reading. It is optional and does not finish or unlock a week."
              />
            </section>
          </>
        ) : (
          <p className="text-sm text-stone-700">Answer the reading questions first to open the card-word meanings and gloss check. You have answered <strong>{reading.answered} of {reading.total}</strong>. <a href="#reading-questions" className="text-indigo-700 underline">Go to the questions</a></p>
        )}
      </div>
    </details>
  );
}
