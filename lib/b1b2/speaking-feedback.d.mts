export type StructureKind = 'although' | 'which' | 'so that' | 'because of' | 'present perfect' | 'time or if clause' | 'modal' | 'passive' | 'conditional' | 'future perfect' | 'past modal';
export type StructurePoint = { original: string; upgraded: string; explanation: string; structure: StructureKind };
export type Fluency = { wordCount: number; seconds: number | null; wordsPerMinute: number | null; pauses: number | null };
export type SoundTip = { word: string; label: string; tip: string };
export type CuePointEvidence = { label: string; quote: string };
export type CueChecklistItem = { label: string; covered: boolean; quote?: string };
export type ImprovedHighlight = { substring: string; label: string; explanation: string; before?: string };
export type UsedHighlightReport = { substring: string; label: string; used: boolean };
export type SpeakingAreaDetail = { score: number; strength: string; improvement: string };
export type SpeakingAreasPayload = {
  grammar_and_vocabulary: SpeakingAreaDetail;
  discourse_management: SpeakingAreaDetail;
  pronunciation: SpeakingAreaDetail | null;
  interactive_communication: SpeakingAreaDetail | null;
};
export type TranscriptionFixPair = { heard: string; intended: string };
export type CleanedTranscriptResult = { cleanedTranscript: string; repairedWords: string[] };
export type DiffSpan = { substring: string; before: string; start: number; end: number };
export type ShortSpeakingFeedback = {
  transcript?: string;
  feedback?: string;
  summary?: string;
  nextStep?: string;
  improvedResponse?: string;
  highlights?: ImprovedHighlight[];
  usedHighlights?: UsedHighlightReport[];
  showExampleFirst?: boolean;
  examplePromptMessage?: string | null;
  areas?: SpeakingAreasPayload | null;
  teacherAreaMarks?: Partial<Record<'grammar_and_vocabulary' | 'discourse_management' | 'pronunciation' | 'interactive_communication', number>> | null;
  structure?: StructurePoint | null;
  fluency?: Fluency | null;
  soundTips?: SoundTip[];
  cuePoints?: CuePointEvidence[];
  cueChecklist?: CueChecklistItem[];
};
export const MAX_IMPROVED_HIGHLIGHTS: 3;
export function hasMeaninglessFiller(text: string): boolean;
export function stripMeaninglessFiller(text: string): string;
export function cleanTranscriptionArtifacts(rawTranscript: string, aiTranscriptionFixes?: TranscriptionFixPair[] | null): CleanedTranscriptResult;
export function structureUsed(text: string, structure: StructureKind | string): boolean;
export function sentenceList(text: string): string[];
export function structurePoint(raw: unknown, transcript: string, weekNumber?: number | null): StructurePoint | null;
export function fluencyFromWhisper(transcript: string, result: unknown): Fluency;
export function soundTips(transcript: string, options?: { excludeWords?: Iterable<string>; weekNumber?: number | null }): SoundTip[];
export function cuePointEvidence(raw: unknown, transcript: string, labels: string[]): CuePointEvidence[];
export function cueChecklistFromEvidence(rawCuePoints: unknown, transcript: string, labels: string[]): CueChecklistItem[];
export function diffChangedSpans(learnerTranscript: string, improvedResponse: string, excludeWords?: Iterable<string>): DiffSpan[];
export function validateImprovedHighlights(
  rawHighlights: unknown,
  improvedResponse: string,
  weekNumber?: number | null,
  options?: {
    learnerTranscript?: string | null;
    excludeWords?: Iterable<string>;
    corrections?: Array<{ original?: string; corrected_sentence?: string; explanation?: string }>;
  },
): ImprovedHighlight[];
export function detectUsedHighlights(retryTranscript: string, highlights: Array<{ substring: string; label?: string }>): UsedHighlightReport[];
export function isShortOrOffTopicTranscript(transcript: string, offTopic?: boolean): boolean;
export function weekStructure(weekNumber?: number | null): StructureKind | null;
