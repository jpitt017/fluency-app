/**
 * Detailed authoring specs for Weeks 1–4 and the assessment documents.
 *
 * The JSON files under supabase-b1-b2/content/curriculum are the canonical
 * source. Supabase holds the same payloads in `syllabus_week_details` and
 * `syllabus_assessments`; the bundled copies keep the app working offline.
 */
import { createServerSupabase } from '@/utils/supabase/server';
import detailsJson from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import assessmentsJson from '../../supabase-b1-b2/content/curriculum/assessments.json';

export interface VocabularyEntry {
  target: string;
  type?: string;
  cefr?: string;
  use?: string;
  example: string;
}

export interface LinkerEntry {
  target: string;
  cefr: string;
  function: string;
  taughtIn: string;
  example: string;
}

export interface SampleItem {
  prompt: string;
  options: string[];
  key: string;
  reason: string;
}

export interface WeekDetail {
  number: number;
  title: string;
  canDo: string;
  featuredVocabulary: string[];
  stretchPhrases: string[];
  grammar: {
    main: string;
    light: string;
    sampleItems: SampleItem[];
    authoringNote: string;
  };
  speaking: { prompt: string; model: string; b2Stretch: string };
  writing: { words: number[]; prompt: string; delayedRecall: string };
  conversation: {
    scenario: string;
    openingLine: string;
    learnerMoves: string;
    targetLanguage: string;
  };
  vocabulary: {
    core: VocabularyEntry[];
    collocations: VocabularyEntry[];
    families: { base: string; forms: string[]; card: string }[];
    optional: VocabularyEntry[];
    newCards: number;
    note: string;
  };
  linkers: LinkerEntry[];
  checkpoint1: { mainItems: number; lightItems: number; focus: string };
}

export interface DetailsDocument {
  version: string;
  sources: string[];
  pilotRules: Record<string, unknown>;
  conversationRules: Record<string, string>;
  weeks: WeekDetail[];
}

export interface AssessmentItem {
  id: string;
  week: number;
  target: string;
  prompt: string;
  options: string[];
  key: string;
  reason: string;
}

export interface AssessmentsDocument {
  version: string;
  note: string;
  writingDescriptors: {
    intro: string;
    criteria: {
      key: string;
      label: string;
      gettingThere: string;
      onTarget: string;
      beyondTarget: string;
    }[];
    rules: string[];
    learnerFeedback: string;
    wordRanges: { weeks: string; range: string; targetBand: string }[];
  };
  placement: {
    durationMinutes: number;
    intro: string;
    parts: { part: string; time: string; what: string; markedBy: string }[];
    questionBlueprint: { level: string; questions: number; focus: string }[];
    bands: { band: string; description: string }[];
    decisionRules: { outcome: string; testScore: string; samples: string }[];
    borderline: string;
    learnerChoice: string;
    efSetCrossCheck: string;
  };
  checkpoint1: {
    intro: string;
    quiz: { scoredItems: number; reserveItems: number; blueprint: string; delivery: string; reporting: string };
    items: AssessmentItem[];
    reserves: AssessmentItem[];
    reserveUse: string;
    speakingTask: string;
    writing: {
      prompts: { label: string; text: string }[];
      conditions: { id: string; setting: string; value: string }[];
    };
    result: { intro: string; thresholds: { part: string; onTarget: string }[]; practiceLinks: string };
    calibration: string[];
  };
}

export const curriculumDetails = detailsJson as unknown as DetailsDocument;
export const assessments = assessmentsJson as unknown as AssessmentsDocument;

export function getWeekDetail(weekNumber: number): WeekDetail | undefined {
  return curriculumDetails.weeks.find((week) => week.number === weekNumber);
}

export function allCheckpointItems(): AssessmentItem[] {
  return [...assessments.checkpoint1.items, ...assessments.checkpoint1.reserves];
}

export interface DetailedContent {
  weeks: WeekDetail[];
  assessments: AssessmentsDocument;
  source: 'supabase' | 'bundled';
}

function bundled(): DetailedContent {
  return { weeks: curriculumDetails.weeks, assessments, source: 'bundled' };
}

/** Prefer the database copies; fall back to the bundled specs if unavailable. */
export async function loadDetailedContent(): Promise<DetailedContent> {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) return bundled();

    const [weeksRes, assessmentsRes] = await Promise.all([
      supabase
        .from('syllabus_week_details')
        .select('week_number, payload')
        .order('week_number', { ascending: true }),
      supabase.from('syllabus_assessments').select('code, payload'),
    ]);

    if (
      weeksRes.error ||
      assessmentsRes.error ||
      weeksRes.data?.length !== curriculumDetails.weeks.length ||
      assessmentsRes.data?.length !== 3
    ) {
      return bundled();
    }

    const byCode = Object.fromEntries(assessmentsRes.data.map((row) => [row.code, row.payload]));
    return {
      weeks: weeksRes.data.map((row) => row.payload as unknown as WeekDetail),
      assessments: {
        ...assessments,
        writingDescriptors: (byCode['writing-descriptors'] ?? assessments.writingDescriptors) as AssessmentsDocument['writingDescriptors'],
        placement: (byCode.placement ?? assessments.placement) as AssessmentsDocument['placement'],
        checkpoint1: (byCode['checkpoint-1'] ?? assessments.checkpoint1) as AssessmentsDocument['checkpoint1'],
      },
      source: 'supabase',
    };
  } catch {
    return bundled();
  }
}
