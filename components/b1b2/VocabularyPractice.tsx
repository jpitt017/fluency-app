'use client';

import { useState } from 'react';
import type { LearnerVocabularyCard } from '@/lib/curriculum/learner-vocabulary';
import type { VocabularyExercises } from '@/lib/curriculum/learner-vocabulary-exercises';

type Question = { id: string; prompt: string; options?: string[] };
type Result = { correct: boolean; feedback: string };

/** One short B1 instruction per step: what to do now, nothing else. */
const STEP_INSTRUCTIONS = [
  'Read the new words for this week. Tap Listen to hear each one.',
  'Match each word to its meaning.',
  'Complete the text with words from the box.',
  'Choose the verb that fits the sentence.',
  'Choose the right form of the word.',
  'Type the word that matches the meaning.',
  'Write your own sentence with two of the new words.',
];

function StepProgress({ current, total, label }: { current: number; total: number; label: string }) {
  const percent = Math.round((current / total) * 100);
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-stone-700">
        Step {current} of {total}: {label}
      </p>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={`Step ${current} of ${total}`}
      >
        <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function PracticeQuestion({ question, week, signedIn, careful }: { question: Question; week: number; signedIn: boolean; careful: VocabularyExercises['careful'] }) {
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function check() {
    setError(''); setBusy(true);
    try {
      const response = await fetch('/api/week/vocabulary/mark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week, id: question.id, answer }) });
      const data = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not check your answer.');
      setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not check your answer.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2 rounded-xl bg-stone-50 p-4">
    <label htmlFor={question.id} className="block font-medium">{question.prompt}</label>
    {question.options ? <select id={question.id} value={answer} onChange={e => { setAnswer(e.target.value); setResult(null); }} className="w-full rounded-lg border border-stone-300 bg-white p-2"><option value="">Choose an answer</option>{question.options.map(option => <option key={option} value={option}>{option}</option>)}</select>
      : <input id={question.id} value={answer} onChange={e => { setAnswer(e.target.value); setResult(null); }} maxLength={500} className="w-full rounded-lg border border-stone-300 bg-white p-2" />}
    <button type="button" disabled={!signedIn || !answer.trim() || busy} onClick={check} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Checking…' : 'Check'}</button>
    {result && <div role="status" className={result.correct ? 'text-emerald-800' : 'text-amber-900'}><strong>{result.correct ? 'Correct! ' : 'Not quite. '}</strong>{result.feedback}{!result.correct && careful.filter(c => `${question.prompt} ${answer}`.toLowerCase().includes(c.target.toLowerCase())).map(c => <p key={c.target}>{c.note}</p>)}</div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}

export default function VocabularyPractice({ cards, exercises, signedIn }: { cards: LearnerVocabularyCard[]; exercises: VocabularyExercises; signedIn: boolean }) {
  const [step, setStep] = useState(0);
  const steps = ['Words', 'Match', 'Complete the text', 'Choose the verb', 'Word forms', 'Type the word', 'Your sentences'];
  function play(card: LearnerVocabularyCard) {
    if (card.audioUrl) { void new Audio(card.audioUrl).play(); return; }
    if ('speechSynthesis' in window) { const speech = new SpeechSynthesisUtterance(card.word); speech.lang = 'en-GB'; window.speechSynthesis.cancel(); window.speechSynthesis.speak(speech); }
  }
  const groups: Question[][] = [[], exercises.match.words.map(q => ({ id: q.id, prompt: q.word, options: exercises.match.meanings })), exercises.text.items.map(q => ({ id: q.id, prompt: `Gap ${q.gap}`, options: exercises.text.wordBox })), exercises.chooseVerb.map(q => ({ id: q.id, prompt: q.question, options: q.options })), exercises.wordForms.map(q => ({ id: q.id, prompt: q.question, options: q.options })), exercises.typeTheWord.items.map(q => ({ id: q.id, prompt: `${q.meaning} (${q.hint})` }))];
  return <section className="space-y-4 rounded-xl border border-indigo-200 bg-white p-5" aria-label="Vocabulary practice">
    <h2 className="text-xl font-semibold">Vocabulary: {exercises.title}</h2>
    <StepProgress current={step + 1} total={steps.length} label={steps[step]} />
    <p className="text-sm text-stone-600">{STEP_INSTRUCTIONS[step]} This practice does not affect week unlocking.</p>
    {!signedIn && <p className="rounded-lg bg-amber-50 p-3 text-sm">Sign in to check and save your answers.</p>}
    {step === 0 && <div className="grid gap-3 sm:grid-cols-2">{cards.map(card => <article key={card.word} className="rounded-xl border border-stone-200 p-4"><h3 className="font-semibold">{card.word} <span className="text-sm font-normal text-stone-500">{card.type} · {card.use === 'P' ? 'active' : 'recognition'}</span></h3><p>{card.meaning}</p><p className="mt-1 text-sm italic">{card.example}</p>{exercises.careful.filter(c => c.target === card.word).map(c => <p className="mt-2 text-sm text-amber-900" key={c.target}>{c.note}</p>)}<button type="button" onClick={() => play(card)} className="mt-2 text-sm text-indigo-700 underline">Listen{!card.audioUrl && ' · Temporary voice'}</button></article>)}</div>}
    {step === 1 && <p className="text-sm text-stone-600">{exercises.match.instruction}</p>}
    {step === 2 && <><p>{exercises.text.instruction}</p><p className="leading-7">{exercises.text.body}</p><p className="text-sm">Word box: {exercises.text.wordBox.join(' · ')}</p></>}
    {step === 5 && <p className="text-sm text-stone-600">{exercises.typeTheWord.instruction}</p>}
    {step > 0 && step < 6 && <div className="space-y-3">{groups[step].map(q => <PracticeQuestion key={q.id} question={q} week={exercises.week} signedIn={signedIn} careful={exercises.careful} />)}</div>}
    {step === 6 && <div><p>Personal sentence feedback is coming soon.</p>{exercises.yourSentence.map(q => <p key={q.id} className="mt-2">{q.prompt}</p>)}</div>}
    <div className="flex justify-between gap-2"><button type="button" disabled={step === 0} onClick={() => setStep(s => s - 1)} className="rounded-lg border px-4 py-2 disabled:opacity-40">Previous</button><button type="button" disabled={step === steps.length - 1} onClick={() => setStep(s => s + 1)} className="rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:opacity-40">Next</button></div>
  </section>;
}
