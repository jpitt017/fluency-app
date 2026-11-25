import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import vocabularyBank from '../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json';
import { learnerGrammar } from './learner-grammar';
import { learnerVocabularyExercises } from './learner-vocabulary-exercises';
import { termForExercise } from './vocabulary-review-link.mjs';
import { grammarItemFlags, vocabularyItemFlags } from './week-practice.mjs';

/**
 * The two practices on /week/[n], as flat lists the server can count.
 *
 * One shape, built once, used by three callers that must agree:
 *
 *   - the page, to decide which answers to send back and where to start;
 *   - the finish route, to count what was answered (never trusting a count from
 *     the browser) and to know which mistakes deserve a Review card;
 *   - the unit tests, which check the totals the summary shows.
 *
 * The flags are the rules in week-practice.mjs: optional items never block
 * finishing, counted items are what "You got X of Y right" is about. `key` is
 * only read on the server, to write a Review card's corrected sentence; it is
 * never serialised to the browser by anything that imports this module.
 */

export type PlannedItem = {
  id: string;
  prompt: string;
  optional: boolean;
  counted: boolean;
  /** Server-only: the authored answer, for a Review card. */
  key?: string;
  /** Server-only: the vocabulary term this item practises. */
  term?: string | null;
  /** Server-only: the authored feedback for a fixed vocabulary item. */
  feedback?: string;
};

export type PlannedStep = { index: number; title: string; items: PlannedItem[] };

export type PracticePlan = { steps: PlannedStep[]; items: PlannedItem[] };

/** Grammar: five learner steps, with the app-marked and Extra items optional. */
export function grammarPlan(week: number): PracticePlan | null {
  const grammar = learnerGrammar(week);
  if (!grammar) return null;
  const bank = details.weeks.find((entry) => entry.number === week)?.grammar.practice.items ?? [];
  const steps = grammar.steps.map((step, index) => ({
    index,
    title: step.title,
    items: step.items.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      ...grammarItemFlags(item),
      key: (bank.find((entry) => entry.id === item.id) as { key?: unknown } | undefined)?.key as
        | string
        | undefined,
    })),
  }));
  return { steps, items: steps.flatMap((step) => step.items) };
}

/**
 * Vocabulary: seven steps, in the component's order. Step 1 is the word cards
 * (no questions), steps 2-6 are the fixed-answer exercises, step 7 is the
 * learner's own sentences.
 */
export function vocabularyPlan(week: number): PracticePlan | null {
  const exercises = learnerVocabularyExercises(week);
  if (!exercises) return null;
  const bankWeek = vocabularyBank.weeks.find((entry) => entry.week === week);
  const termFor = (id: string) => (bankWeek ? termForExercise(bankWeek, id) : null);
  const feedbackFor = (id: string) =>
    [
      ...(bankWeek?.chooseVerb ?? []),
      ...(bankWeek?.wordForms ?? []),
      ...(bankWeek?.text.items ?? []),
    ].find((entry) => entry.id === id)?.reason;
  const item = (id: string, prompt: string, index: number): PlannedItem => ({
    id,
    prompt,
    ...vocabularyItemFlags(index),
    term: termFor(id),
    feedback: feedbackFor(id),
  });

  const definitions: { title: string; items: Omit<PlannedItem, 'optional' | 'counted'>[] }[] = [
    { title: 'Words', items: [] },
    { title: 'Match', items: exercises.match.words.map((word) => ({ id: word.id, prompt: word.word })) },
    { title: 'Complete the text', items: exercises.text.items.map((entry) => ({ id: entry.id, prompt: `Gap ${entry.gap}` })) },
    { title: 'Choose the verb', items: exercises.chooseVerb.map((entry) => ({ id: entry.id, prompt: entry.question })) },
    { title: 'Word forms', items: exercises.wordForms.map((entry) => ({ id: entry.id, prompt: entry.question })) },
    { title: 'Type the word', items: exercises.typeTheWord.items.map((entry) => ({ id: entry.id, prompt: entry.meaning })) },
    { title: 'Your sentences', items: exercises.yourSentence.map((entry) => ({ id: entry.id, prompt: entry.prompt })) },
  ];

  const steps = definitions.map((definition, index) => ({
    index,
    title: definition.title,
    items: definition.items.map((entry) => item(entry.id, entry.prompt, index)),
  }));
  return { steps, items: steps.flatMap((step) => step.items) };
}

export function practicePlan(skill: 'grammar' | 'vocabulary', week: number): PracticePlan | null {
  return skill === 'grammar' ? grammarPlan(week) : vocabularyPlan(week);
}

/** The weeks that have this practice at all. */
export function weeksWithPractice(): number[] {
  return details.weeks.map((entry) => entry.number);
}
