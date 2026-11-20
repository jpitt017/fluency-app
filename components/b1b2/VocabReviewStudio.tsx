'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { speakPhrase } from '@/lib/b1b2/speech';
import { createClient } from '@/utils/supabase/client';
import type { VocabDeckSummary } from '@/lib/b1b2/types';

interface DueCard {
  card_id: string;
  deck_id?: string;
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
  { grade: 'again', label: 'Again', hint: '1 day' },
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

export default function VocabReviewStudio({
  decks,
  signedIn,
  dueCount,
  totalReviews,
}: {
  decks: VocabDeckSummary[];
  signedIn: boolean;
  dueCount: number;
  totalReviews: number;
}) {
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [queue, setQueue] = useState<DueCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [contextMode, setContextMode] = useState(true);
  const [typedGuess, setTypedGuess] = useState('');
  const [accent, setAccent] = useState<'en-GB' | 'en-US'>('en-GB');
  const [browsingDeckId, setBrowsingDeckId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const totalCards = useMemo(() => decks.reduce((sum, d) => sum + d.items.length, 0), [decks]);

  async function startQueue(deckId: string | null = null) {
    if (!signedIn) return;
    setBusy(true);
    setError('');
    setSelectedDeckId(deckId);
    try {
      await supabase.rpc('ensure_vocab_cards');

      if (!deckId) {
        const { data, error: dueError } = await supabase.rpc('get_due_cards', { p_limit: 25 });
        if (dueError) throw dueError;
        setQueue((data as DueCard[] | null) ?? []);
      } else {
        const nowIso = new Date().toISOString();
        const { data, error: cardError } = await supabase
          .from('vocab_cards')
          .select(
            'id, ladder_step, vocab_items!inner(id, deck_id, term, part_of_speech, ipa, definition, example, collocations, translation_es)',
          )
          .eq('vocab_items.deck_id', deckId)
          .lte('due_at', nowIso)
          .order('due_at', { ascending: true })
          .limit(25);

        if (cardError) throw cardError;

        const mapped: DueCard[] = (data ?? []).map((row) => {
          const item = (Array.isArray(row.vocab_items) ? row.vocab_items[0] : row.vocab_items) as unknown as {
            deck_id: string;
            term: string;
            part_of_speech: string | null;
            ipa: string | null;
            definition: string | null;
            example: string | null;
            collocations: string[] | null;
            translation_es: string | null;
          };
          return {
            card_id: String(row.id),
            deck_id: item.deck_id,
            term: item.term,
            part_of_speech: item.part_of_speech,
            ipa: item.ipa,
            definition: item.definition,
            example: item.example,
            collocations: item.collocations,
            translation_es: item.translation_es,
            ladder_step: Number(row.ladder_step ?? 0),
          };
        });
        setQueue(mapped);
      }

      setIndex(0);
      setReviewed(0);
      setRevealed(false);
      setTypedGuess('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load due vocabulary cards.');
    } finally {
      setBusy(false);
    }
  }

  async function gradeCard(grade: (typeof GRADES)[number]['grade']) {
    if (!queue || !queue[index]) return;
    setBusy(true);
    setError('');
    try {
      const { error: reviewError } = await supabase.rpc('review_vocab_card', {
        p_card_id: queue[index].card_id,
        p_grade: grade,
      });
      if (reviewError) throw reviewError;
      setReviewed((n) => n + 1);
      setIndex((i) => i + 1);
      setRevealed(false);
      setTypedGuess('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save review.');
    } finally {
      setBusy(false);
    }
  }

  const activeDeckTitle = selectedDeckId
    ? decks.find((d) => d.id === selectedDeckId)?.title ?? 'Selected deck'
    : 'All due cards';

  const currentCard = queue && index < queue.length ? queue[index] : null;
  const maskedSentence = currentCard?.example ? maskExample(currentCard.example, currentCard.term) : null;
  const showCloze = Boolean(currentCard && contextMode && maskedSentence);
  const guessMatched = currentCard
    ? typedGuess.trim().toLowerCase() === currentCard.term.trim().toLowerCase()
    : false;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
              Spaced Repetition (1 → 3 → 7 → 14 → 30 → 60 days)
            </p>
            <h2 className="mt-1 font-serif text-2xl font-bold text-stone-900">Contextual Vocabulary Queue</h2>
            <p className="mt-1 text-sm text-stone-600">
              {totalCards} collocations &amp; phrases across {decks.length} module decks
              {signedIn ? ` · ${dueCount} due now · ${totalReviews + reviewed} reviews logged` : ''}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-stone-200 bg-stone-50 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setAccent('en-GB')}
                className={`rounded-lg px-2.5 py-1 ${accent === 'en-GB' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-stone-600'}`}
              >
                UK Audio
              </button>
              <button
                type="button"
                onClick={() => setAccent('en-US')}
                className={`rounded-lg px-2.5 py-1 ${accent === 'en-US' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-stone-600'}`}
              >
                US Audio
              </button>
            </div>
            {signedIn ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => startQueue(null)}
                className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:bg-stone-300"
              >
                {busy ? 'Loading queue…' : dueCount > 0 ? `Review due cards (${dueCount})` : 'Sync & check due cards'}
              </button>
            ) : (
              <Link
                href="/login?next=/vocabulary"
                className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800"
              >
                Sign in to track SRS
              </Link>
            )}
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}

        {queue !== null && (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
              <span className="font-semibold uppercase tracking-wide text-indigo-700">{activeDeckTitle}</span>
              <div className="flex items-center gap-3">
                {currentCard && (
                  <span>
                    Card {index + 1} / {queue.length} · Ladder step {currentCard.ladder_step}
                  </span>
                )}
                {maskedSentence && (
                  <button
                    type="button"
                    onClick={() => setContextMode((v) => !v)}
                    className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100"
                  >
                    {contextMode ? 'Switch to flashcard' : 'Switch to context cloze'}
                  </button>
                )}
              </div>
            </div>

            {queue.length === 0 ? (
              <p className="mt-3 text-sm font-medium text-emerald-800">
                No cards are due in {activeDeckTitle.toLowerCase()} right now. Browse any deck below or return tomorrow.
              </p>
            ) : !currentCard ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-emerald-800">Session complete — {reviewed} cards reviewed.</p>
                <button
                  type="button"
                  onClick={() => startQueue(selectedDeckId)}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                >
                  Check queue again
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-stone-200 bg-white p-5">
                {showCloze && !revealed ? (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
                      Produce the phrase in context ({currentCard.part_of_speech ?? 'phrase'})
                    </p>
                    <p className="text-lg font-medium leading-7 text-stone-900">{maskedSentence}</p>
                    {currentCard.definition && (
                      <p className="text-xs text-stone-600">Clue: {currentCard.definition}</p>
                    )}
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
                        className="flex-1 rounded-xl border border-stone-300 bg-stone-50/50 px-3.5 py-2 text-sm text-stone-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
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
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-2xl font-bold text-stone-900">{currentCard.term}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          {currentCard.part_of_speech ?? 'lexical item'}
                          {currentCard.ipa ? ` · ${currentCard.ipa}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void speakPhrase(currentCard.example || currentCard.term, accent, 0.95)}
                        className="rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                      >
                        Pronounce ({accent === 'en-GB' ? 'UK' : 'US'})
                      </button>
                    </div>

                    {typedGuess.trim() && (
                      <p className={`mt-2 text-xs font-semibold ${guessMatched ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {guessMatched ? 'Exact match in context!' : `Your recall: "${typedGuess.trim()}"`}
                      </p>
                    )}

                    {revealed ? (
                      <div className="mt-4 space-y-2 rounded-xl bg-stone-50 p-4 text-sm text-stone-800">
                        {currentCard.definition && <p>{currentCard.definition}</p>}
                        {currentCard.example && (
                          <p className="italic text-stone-600">&ldquo;{currentCard.example}&rdquo;</p>
                        )}
                        {currentCard.collocations?.length ? (
                          <p className="text-xs text-stone-600">
                            <strong className="text-stone-700">Collocations:</strong>{' '}
                            {currentCard.collocations?.join(' · ')}
                          </p>
                        ) : null}
                        {currentCard.translation_es && (
                          <p className="text-xs text-stone-500">ES: {currentCard.translation_es}</p>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRevealed(true)}
                        className="mt-4 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                      >
                        Reveal definition &amp; collocations
                      </button>
                    )}
                  </>
                )}

                {revealed && (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {GRADES.map((g) => (
                      <button
                        key={g.grade}
                        type="button"
                        disabled={busy}
                        onClick={() => gradeCard(g.grade)}
                        className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs font-semibold text-stone-800 transition hover:border-indigo-500 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        {g.label}
                        <span className="mt-0.5 block text-[10px] font-normal text-stone-500">{g.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-xl font-bold text-stone-900">Topic Decks (Modules 1–8)</h2>
          <span className="text-xs text-stone-500">Inspect collocations, audio, and examples or drill due cards</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {decks.map((deck) => {
            const isOpen = browsingDeckId === deck.id;

            return (
              <div key={deck.id} className="rounded-2xl border border-stone-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                      {deck.module_number ? `Module ${deck.module_number}` : deck.topic}
                    </span>
                    <h3 className="mt-0.5 text-base font-bold text-stone-900">{deck.title}</h3>
                    {deck.description && <p className="mt-1 text-xs leading-5 text-stone-600">{deck.description}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                    {deck.items.length} cards
                  </span>
                </div>

                <p className="mt-3 text-xs text-stone-500">
                  Topic: {deck.topic} · Daily target: {deck.daily_target} cards/day
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {signedIn && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startQueue(deck.id)}
                      className="rounded-xl bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:bg-stone-300"
                    >
                      Practice deck
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBrowsingDeckId(isOpen ? null : deck.id)}
                    className="rounded-xl border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
                  >
                    {isOpen ? 'Hide word list' : `Browse ${deck.items.length} words`}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-3">
                    {deck.items.map((item) => (
                      <div key={item.id} className="rounded-lg bg-white p-2.5 text-xs ring-1 ring-stone-200/80">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-stone-900">
                            {item.term}{' '}
                            {item.ipa && <span className="font-normal text-stone-500">{item.ipa}</span>}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void speakPhrase(item.example || item.term, accent, 0.95)}
                              className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700 hover:bg-stone-100"
                            >
                              Listen
                            </button>
                            <span className="text-[10px] font-semibold uppercase text-indigo-700">{item.band}</span>
                          </div>
                        </div>
                        <p className="mt-1 text-stone-700">{item.definition}</p>
                        <p className="mt-0.5 italic text-stone-500">{item.example}</p>
                        {item.collocations.length > 0 && (
                          <p className="mt-1 text-[11px] text-stone-500">Collocations: {item.collocations.join(' · ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
