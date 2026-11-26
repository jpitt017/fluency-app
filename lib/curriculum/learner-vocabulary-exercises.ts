import 'server-only';
import bank from '../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json';
import { projectVocabularyExercises } from './vocabulary-exercise-projection.mjs';
import sentenceSupport from '../../supabase-b1-b2/content/curriculum/vocab-sentence-support-weeks-01-04.json';

export type VocabularyExercises = {
  week: number; title: string; careful: { target: string; note: string }[];
  match: { instruction: string; words: { id: string; word: string }[]; meanings: string[] };
  text: { instruction: string; body: string; wordBox: string[]; items: { id: string; gap: number }[] };
  chooseVerb: { id: string; question: string; options: string[] }[];
  wordForms: { id: string; question: string; options: string[] }[];
  typeTheWord: { instruction: string; items: { id: string; meaning: string; hint: string }[] };
  yourSentence: { id: string; prompt: string; pattern?: string; starter?: string }[];
};

export function learnerVocabularyExercises(number: number): VocabularyExercises | null {
  const week = bank.weeks.find(entry => entry.week === number);
  if (!week) return null;
  const support = sentenceSupport.items.filter((entry) => entry.id.startsWith(`V${number}-`));
  if (week.yourSentence.some((item) => !support.some((entry) => entry.id === item.id))) {
    throw new Error(`Missing vocabulary sentence support for Week ${number}`);
  }
  return projectVocabularyExercises(week, support) as VocabularyExercises;
}
