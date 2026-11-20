'use client';

import Link from 'next/link';
import { useState } from 'react';
import { speakPhrase } from '@/lib/b1b2/speech';
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
  { grade: 'again', label: 'Again', hint: 'Reset (1d)' },
  { grade: 'hard', label: 'Hard', hint: 'Shorten' },
  { grade: 'good', label: 'Good', hint: 'Advance' },
  { grade: 'easy', label: 'Easy', hint: 'Jump +2' },
] as const;

function maskExample(example: string, term: string): string | null {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  if (!regex.test(example)) return null;
  return example.replace(regex, '______');
}

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
  const [contextMode, setContextMode] = useState(true);
  const [typedGuess, setTypedGuess] = useState('');
  const [accent, setAccent] = useState<'en-GB' | 'en-US'>('en-GB');
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
      setTypedGuess('');
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
      setTypedGuess('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that review.');
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-sm text-stone-700">
          {cardCount} cards from this lesson&apos;s deck are waiting in your spaced-repetition queue.
        </p>
        <Link
          href={`/login?next=/curriculum/lessons/${lessonNumber}`}
          className="mt-3 inline-block rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
        >
          Sign in to review
        </Link>
      </div>
    );
  }

  if (cards === null) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-sm text-stone-700">
          {cardCount} collocations &amp; phrases · spaced intervals at {reviewLadderDays.join(', ')} days.
        </p>
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="mt-3 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:bg-stone-300"
        >
          {busy ? 'Loading queue…' : 'Start 3-minute warm-up'}
        </button>
        {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      </div>
    );
  }

  if (!cards.length) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        Nothing due right now — your deck is up to date.
      </p>
    );
  }

  if (index >= cards.length) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-900">Warm-up complete — {reviewed} cards reviewed.</p>
        <button type="button" onClick={start} className="mt-2 text-xs font-semibold text-emerald-800 underline">
          Check the queue again
        </button>
      </div>
    );
  }

  const card = cards[index];
  const maskedSentence = card.example ? maskExample(card.example, card.term) : null;
  const showCloze = contextMode && Boolean(maskedSentence);
  const guessMatched =
    typedGuess.trim().toLowerCase() === card.term.trim().toLowerCase();

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
        <span>
          Card {index + 1} / {cards.length} · Step {card.ladder_step}
        </span>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setAccent('en-GB')}
              className={`rounded-md px-2 py-0.5 ${accent === 'en-GB' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-stone-600'}`}
            >
              UK
            </button>
            <button
              type="button"
              onClick={() => setAccent('en-US')}
              className={`rounded-md px-2 py-0.5 ${accent === 'en-US' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-stone-600'}`}
            >
              US
            </button>
          </div>
          {maskedSentence && (
            <button
              type="button"
              onClick={() => setContextMode((v) => !v)}
              className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-100"
            >
              {contextMode ? 'Flashcard mode' : 'Context cloze'}
            </button>
          )}
        </div>
      </div>

      {showCloze && !revealed ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Produce the phrase in context ({card.part_of_speech ?? 'phrase'})
          </p>
          <p className="text-base font-medium leading-7 text-stone-900">{maskedSentence}</p>
          {card.definition && <p className="text-xs text-stone-600">Meaning: {card.definition}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <input
              type="text"
              value={typedGuess}
              onChange={(e) => setTypedGuess(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setRevealed(true);
                }
              }}
              placeholder="Type the missing phrase…"
              className="flex-1 rounded-xl border border-stone-300 bg-stone-50/50 px-3 py-2 text-sm text-stone-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800"
            >
              Check &amp; reveal
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xl font-bold text-stone-900">{card.term}</p>
              <p className="text-xs text-stone-500">
                {card.part_of_speech ?? 'entry'} {card.ipa ? `· ${card.ipa}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void speakPhrase(card.example || card.term, accent, 0.95)}
              className="rounded-lg border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
            >
              Pronounce ({accent === 'en-GB' ? 'UK' : 'US'})
            </button>
          </div>

          {typedGuess.trim() && (
            <p className={`mt-2 text-xs font-semibold ${guessMatched ? 'text-emerald-700' : 'text-amber-700'}`}>
              {guessMatched ? 'Exact match!' : `Your recall: "${typedGuess.trim()}"`}
            </p>
          )}

          {revealed ? (
            <div className="mt-3 space-y-1.5 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
              {card.definition && <p>{card.definition}</p>}
              {card.example && <p className="italic text-stone-600">{card.example}</p>}
              {card.collocations?.length ? (
                <p className="text-xs text-stone-500">Collocations: {card.collocations.join(' · ')}</p>
              ) : null}
              {card.translation_es && <p className="text-xs text-stone-500">ES: {card.translation_es}</p>}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="mt-3 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Show meaning &amp; collocations
            </button>
          )}
        </>
      )}

      {revealed && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GRADES.map((option) => (
            <button
              key={option.grade}
              type="button"
              disabled={busy}
              onClick={() => grade(option.grade)}
              className="rounded-xl border border-stone-200 bg-white px-2 py-2 text-xs font-semibold text-stone-700 transition hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-50"
            >
              {option.label}
              <span className="mt-0.5 block text-[10px] font-normal text-stone-500">{option.hint}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
