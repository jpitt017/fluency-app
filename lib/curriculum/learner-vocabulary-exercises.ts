import 'server-only';
import bank from '../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json';
import { projectVocabularyExercises } from './vocabulary-exercise-projection.mjs';

export type VocabularyExercises = {
  week: number; title: string; careful: { target: string; note: string }[];
  match: { instruction: string; words: { id: string; word: string }[]; meanings: string[] };
  text: { instruction: string; body: string; wordBox: string[]; items: { id: string; gap: number }[] };
  chooseVerb: { id: string; question: string; options: string[] }[];
  wordForms: { id: string; question: string; options: string[] }[];
  typeTheWord: { instruction: string; items: { id: string; meaning: string; hint: string }[] };
  yourSentence: { id: string; prompt: string }[];
};

export function learnerVocabularyExercises(number: number): VocabularyExercises | null {
  const week = bank.weeks.find(entry => entry.week === number);
  return week ? projectVocabularyExercises(week) as VocabularyExercises : null;
}
