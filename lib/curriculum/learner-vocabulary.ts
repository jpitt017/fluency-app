import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import meanings from './vocabulary-meanings.json';

const recorded: Record<string, string> = {
  'turning point': '/audio/module-1/turning-point.mp3',
  'get used to': '/audio/module-1/get-used-to.mp3',
  'look back on': '/audio/module-1/look-back-on.mp3',
  'get on with': '/audio/module-1/get-on-with.mp3',
};
const typeNames: Record<string, string> = { 'v.': 'verb', 'n.': 'noun', 'n. phr.': 'noun phrase', 'v. phr.': 'verb phrase', 'mw. v.': 'multi-word verb', 'phr. v.': 'phrasal verb', 'adv.': 'adverb', 'adj.': 'adjective' };
export type LearnerVocabularyCard = { word: string; type: string; meaning: string; example: string; use: 'P' | 'B'; audioUrl: string | null };

/** Explicit learner-safe vocabulary projection. Missing authoring meanings fail closed. */
export function learnerVocabulary(weekNumber: number): LearnerVocabularyCard[] | null {
  const week = details.weeks.find(entry => entry.number === weekNumber);
  if (!week) return null;
  const entries: { target: string; example: string; type?: string; use?: string }[] = [
    ...week.vocabulary.core, ...week.vocabulary.collocations, ...week.vocabulary.optional,
  ];
  return entries.map(entry => {
    const meaning = (meanings as Record<string, string>)[entry.target];
    if (!meaning) throw new Error(`Missing vocabulary meaning for ${entry.target}`);
    return { word: entry.target, type: typeNames[entry.type ?? ''] ?? 'phrase', meaning, example: entry.example,
      use: entry.use === 'P' ? 'P' : 'B', audioUrl: recorded[entry.target] ?? null };
  });
}
