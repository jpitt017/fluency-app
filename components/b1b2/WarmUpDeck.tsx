'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

interface DueCard {
  card_id: string;
  term: string;
  part_of_speech: string | null;
  ipa: string | null;
  definition: string | null;
  example: string | null;
  collocations: string[] | null;
  translation_es: string | null;
  ladder_step: number;
}

const GRADES = [
  { grade: 'again', label: 'Again', hint: 'Forgot it' },
  { grade: 'hard', label: 'Hard', hint: 'Slow recall' },
  { grade: 'good', label: 'Good', hint: 'Recalled' },
  { grade: 'easy', label: 'Easy', hint: 'Automatic' },
] as const;

/**
 * Warm-up block: top up the learner's SRS deck from the lesson's vocabulary,
 * then walk the cards that are due. Scheduling lives in `review_vocab_card`,
 * so the UI never does interval maths.
 */
export default function WarmUpDeck({
  lessonNumber,
  signedIn,
  cardCount,
  reviewLadderDays,
}: {
  lessonNumber: number;
  signedIn: boolean;
  cardCount: number;
  reviewLadderDays: number[];
}) {
  const [cards, setCards] = useState<DueCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  async function start() {
    setBusy(true);
    setError('');
    try {
      await supabase.rpc('ensure_vocab_cards');
      const { data, error: dueError } = await supabase.rpc('get_due_cards', { p_limit: Math.max(cardCount, 8) });
      if (dueError) throw dueError;
      setCards((data as DueCard[] | null) ?? []);
      setIndex(0);
      setReviewed(0);
      setRevealed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your review queue.');
    } finally {
      setBusy(false);
    }
  }

  async function grade(value: (typeof GRADES)[number]['grade']) {
    if (!cards || !cards[index]) return;
    setBusy(true);
    try {
      const { error: reviewError } = await supabase.rpc('review_vocab_card', {
        p_card_id: cards[index].card_id,
        p_grade: value,
      });
      if (reviewError) throw reviewError;
      setReviewed((count) => count + 1);
      setIndex((current) => current + 1);
      setRevealed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that review.');
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <div className="rounded-xl bg-slate-50 p-4">
        <p className="text-sm text-slate-700">
          {cardCount} cards from this lesson&apos;s deck are waiting in your spaced-repetition queue.
        </p>
        <Link
          href={`/login?next=/curriculum/lessons/${lessonNumber}`}
          className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Sign in to review
        </Link>
      </div>
    );
  }

  if (cards === null) {
    return (
      <div className="rounded-xl bg-slate-50 p-4">
        <p className="text-sm text-slate-700">
          {cardCount} new cards · review at {reviewLadderDays.join(', ')} days.
        </p>
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
        >
          {busy ? 'Loading queue…' : 'Start 3-minute warm-up'}
        </button>
        {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      </div>
    );
  }

  if (!cards.length) {
    return <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">Nothing due right now — your deck is up to date.</p>;
  }

  if (index >= cards.length) {
    return (
      <div className="rounded-xl bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-900">Warm-up complete — {reviewed} cards reviewed.</p>
        <button type="button" onClick={start} className="mt-2 text-xs font-semibold text-emerald-800 underline">
          Check the queue again
        </button>
      </div>
    );
  }

  const card = cards[index];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Card {index + 1} / {cards.length}
        </span>
        <span>Step {card.ladder_step} of the ladder</span>
      </div>
      <p className="mt-3 text-xl font-bold text-slate-900">{card.term}</p>
      <p className="text-xs text-slate-500">
        {card.part_of_speech ?? 'entry'} {card.ipa ? `· ${card.ipa}` : ''}
      </p>
      {revealed ? (
        <div className="mt-3 space-y-1 text-sm text-slate-700">
          {card.definition && <p>{card.definition}</p>}
          {card.example && <p className="italic text-slate-600">{card.example}</p>}
          {card.collocations?.length ? <p className="text-xs text-slate-500">Collocations: {card.collocations.join(' · ')}</p> : null}
          {card.translation_es && <p className="text-xs text-slate-500">ES: {card.translation_es}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Show meaning
        </button>
      )}
      {revealed && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GRADES.map((option) => (
            <button
              key={option.grade}
              type="button"
              disabled={busy}
              onClick={() => grade(option.grade)}
              className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
            >
              {option.label}
              <span className="mt-0.5 block text-[10px] font-normal text-slate-500">{option.hint}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
