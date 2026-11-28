export const MAX_B1B2_SENTENCE_WORDS: number;
export const MAX_CORRECTIONS_PER_TEXT: number;
export const LEVEL_RULES_PROMPT_BLOCK: string;
export const C1_BLOCKED_WORDS: Set<string>;

export interface LevelGuardOptions {
  weekNumber?: number | null;
  learnerText?: string;
  extraAllowedWords?: string[];
  maxSentenceWords?: number;
}

export function getWeekVocabularySet(weekNumber?: number | null): Set<string>;
export function isAllowedB1B2Word(rawToken: string, options?: LevelGuardOptions): boolean;
export function findOutOfListWords(text: string, options?: LevelGuardOptions): string[];
export function splitSentences(text: string): string[];
export function countPlainWords(text: string): number;
export function maxSentenceWordCount(text: string): number;
export function hasDisallowedAdvancedGrammar(text: string): boolean;
export function enforceSentenceWordLimit(text: string, maxWords?: number): string;
export function simplifyToB1B2(text: string, options?: LevelGuardOptions): string;
export function preserveClearLearnerSentences(
  originalText: string,
  rewrittenText: string,
  corrections?: Array<{ original?: string }>,
  options?: { weekNumber?: number | null },
): string;
