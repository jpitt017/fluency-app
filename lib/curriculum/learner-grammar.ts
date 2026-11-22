import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import { projectLearnerGrammar } from './grammar-marking.mjs';

export type LearnerGrammarItem = {
  id: string;
  step: string;
  prompt: string;
  options: string[];
  blankCount: number;
};
export type LearnerGrammar = {
  notice: string;
  items: LearnerGrammarItem[];
};

/** Strict projection: never pass the teacher's practice object to the browser. */
export function learnerGrammar(weekNumber: number): LearnerGrammar | null {
  const practice = details.weeks.find(week => week.number === weekNumber)?.grammar.practice;
  if (!practice) return null;
  return projectLearnerGrammar(practice);
}
