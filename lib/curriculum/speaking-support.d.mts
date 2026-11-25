export type PublicSpeakingSupport = {
  planNotes: string[];
  retryGoal: string;
};
export type SpeakingSupportInput = {
  planNotes: string[];
  retryGoal: string;
};
export function publicSpeakingSupport(week: SpeakingSupportInput | null): PublicSpeakingSupport | null;
export function phrasesUsed(text: string, phrases: string[]): string[];
export function splitHighlightedText(text: string, phrases: string[]): { text: string; highlighted: boolean }[];
export function validSupportNotes(input: unknown, labels: string[]): { label: string; note: string }[] | null;
