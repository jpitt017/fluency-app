'use client';

import { GlossCheck, TapWord } from '@/components/b1b2/ListeningSupport';
import type { LearnerReadingSupport, LearnerReading } from '@/lib/curriculum/learner-week';

export function ReadingBeforeQuestions({ support }: { support: LearnerReadingSupport | null }) {
  if (!support) return null;
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-stone-700">{support.context}</p>
      <div className="rounded-xl bg-indigo-50 p-4">
        <p className="font-medium text-indigo-950">{support.predict}</p>
      </div>
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
      <p className="text-xs text-stone-600">Amber words open a meaning and Spanish translation. Green words come from your vocabulary cards.</p>
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
