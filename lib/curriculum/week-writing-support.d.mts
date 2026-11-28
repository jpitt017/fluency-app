export interface ParagraphPlanPrompt {
  paragraph: number;
  prompt: string;
  starters: string[];
}

export interface ModelPhraseHighlight {
  substring: string;
  label: string;
  explanation: string;
}

export interface WeekWordRange {
  min: number;
  max: number;
  capUnder: number;
  warnOver: number;
}

export declare function plainGrammarTargetsForWeek(
  weekNumber?: number | null,
  rawGrammar?: string | null,
): string[];
export declare function targetWordsForWeek(
  featuredWords?: string[],
  linkers?: string[],
): string[];
export declare function starterInsertText(template: string): string;
export declare function buildParagraphPlanPrompts(
  planFrame?: string[],
  usefulLanguage?: string[],
  weekNumber?: number | null,
): ParagraphPlanPrompt[];
export declare function filterTaskMatchingGrammarIdeas(
  grammarIdeas?: string[],
  weekNumber?: number | null,
  targetWords?: string[],
): string[];
export declare function highlightModelAnswer(
  modelAnswer: string,
  weekNumber?: number | null,
  linkers?: string[],
): ModelPhraseHighlight[];
export declare function wordRangeForWeek(weekNumber?: number | null): WeekWordRange;
