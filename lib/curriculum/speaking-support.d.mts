export type PublicSpeakingSupport = {
  planNotes: string[];
  focusQuestion: { question: string; options: string[] };
  noticePhrases: string[];
  retryGoal: string;
};
export type SpeakingSupportInput = {
  focusQuestion: { question: string; options: string[] };
  noticePhrases: string[];
  distractors: string[];
  planNotes: string[];
  retryGoal: string;
};
export function publicSpeakingSupport(week: SpeakingSupportInput | null, random?: () => number): PublicSpeakingSupport | null;
export function phrasesUsed(text: string, phrases: string[]): string[];
export function splitHighlightedText(text: string, phrases: string[]): { text: string; highlighted: boolean }[];
export function validSupportNotes(input: unknown, labels: string[]): { label: string; note: string }[] | null;
