/**
 * Two-stage B1 → B2 syllabus.
 *
 * The JSON document under supabase-b1-b2/content/curriculum is the single
 * source of truth: the same fields are seeded into Supabase and rendered by
 * the curriculum routes. `loadSyllabusContent()` prefers the database copy so
 * content edits can be published without a redeploy, and falls back to the
 * bundled document when Supabase is unavailable (local dev, CI, offline).
 */
import { createServerSupabase } from '@/utils/supabase/server';
import syllabusJson from '../../supabase-b1-b2/content/curriculum/two-stage-syllabus.json';

export type RequirementKind = 'optional' | 'either' | 'required' | 'recommended';

export interface SyllabusCourse {
  title: string;
  summary: string;
  audience: string;
  disclaimer: string;
  start: string;
  pace: string;
  totalWeeks: number;
  totalHours: number;
}

export interface SyllabusStage {
  number: number;
  slug: string;
  title: string;
  weekRange: string;
  weekStart: number;
  weekEnd: number;
  weeks: number;
  hours: number;
  startingLevel: string;
  aim: string;
  grammar: string;
  vocabulary: string;
  listeningReading: string;
  speaking: string;
  writing: string;
  extraInput: string;
  checkpoints: number[];
  phases: { weeks: string; focus: string; pronunciationFocus: string }[];
}

export interface WeekCefr {
  canDo: string;
  scale: string;
  level: string;
}

export interface WeekMediation {
  prompt: string;
  source: string;
  output: string;
  scale: string;
  level: string;
  time: string;
  requirement: string;
  requirementKind: RequirementKind;
  countsTowardsUnlocking: boolean;
  feedback: string;
}

export interface SyllabusWeek {
  number: number;
  stage: number;
  phase: string;
  theme: string;
  mainGrammar: string;
  secondaryGrammarLabel: string;
  secondaryGrammar: string | null;
  skillsFocus: string | null;
  cefr: WeekCefr;
  grammar?: { stretch: boolean; structures: string; marking: string };
  mediation?: WeekMediation;
}

export interface WeeklyTask {
  key: string;
  title: string;
  time: string;
  requirement: string;
  requirementKind: RequirementKind;
  order: string;
  href: string;
}

export interface SkillLadderLevel {
  weeks: string;
  value: string;
}

export interface SkillLadder {
  key: string;
  label: string;
  levels: SkillLadderLevel[];
}

export interface SyllabusCheckpoint {
  number: number;
  stage: number;
  afterWeek: number;
  code: string;
  assessed: string;
}

export interface SyllabusDocument {
  version: string;
  source: string;
  course: SyllabusCourse;
  placement: {
    summary: string;
    components: string[];
    belowB1: string;
    outcomes: string[];
  };
  stages: SyllabusStage[];
  weeklyTasks: WeeklyTask[];
  progression: { rule: string; details: string; target: string; feedback: string };
  skillLadders: SkillLadder[];
  weeks: SyllabusWeek[];
  checkpoints: SyllabusCheckpoint[];
  externalAssessments: { code: string; title: string; when: string; description: string }[];
  marking: {
    summary: string;
    onTargetLevel: { weeks: string; level: string }[];
  };
  certificate: string;
  nextSteps: { after: string; condition: string; next: string }[];
  principles: string[];
  adaptation: Record<string, string>;
  aiAndData: string[];
  teachers: string[];
}

export const syllabus = syllabusJson as unknown as SyllabusDocument;

export function getStage(stageNumber: number): SyllabusStage | undefined {
  return syllabus.stages.find((stage) => stage.number === stageNumber);
}

export function getWeek(weekNumber: number): SyllabusWeek | undefined {
  return syllabus.weeks.find((week) => week.number === weekNumber);
}

/** Learner-facing week selector; clamps unknown values to Week 1. */
export function learnerWeekFromParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 32 ? parsed : 1;
}

export function weeksForStage(stageNumber: number): SyllabusWeek[] {
  return syllabus.weeks.filter((week) => week.stage === stageNumber);
}

export function stageForWeek(weekNumber: number): SyllabusStage | undefined {
  return getStage(getWeek(weekNumber)?.stage ?? 0);
}

export function phaseForWeek(weekNumber: number): { weeks: string; focus: string; pronunciationFocus: string } | undefined {
  const stage = stageForWeek(weekNumber);
  const phase = getWeek(weekNumber)?.phase;
  return stage?.phases.find((item) => item.weeks === phase);
}

export function onTargetLevelForWeek(weekNumber: number): string {
  const band = syllabus.marking.onTargetLevel.find(({ weeks }) => {
    const [start, end] = weeks.split('–').map(Number);
    return weekNumber >= start && weekNumber <= end;
  });
  return band?.level ?? '—';
}

export function levelForWeek(ladder: SkillLadder, weekNumber: number): SkillLadderLevel | undefined {
  return ladder.levels.find((level) => {
    const [start, end] = level.weeks.split('-').map(Number);
    return weekNumber >= start && weekNumber <= (end ?? start);
  });
}

export function skillLevelsForWeek(weekNumber: number): Record<string, string> {
  return Object.fromEntries(
    syllabus.skillLadders.map((ladder) => [ladder.key, levelForWeek(ladder, weekNumber)?.value ?? '—']),
  );
}

export function checkpointAfterWeek(weekNumber: number): SyllabusCheckpoint | undefined {
  return syllabus.checkpoints.find((checkpoint) => checkpoint.afterWeek === weekNumber);
}

export function checkpointForStage(stageNumber: number): SyllabusCheckpoint[] {
  return syllabus.checkpoints.filter((checkpoint) => checkpoint.stage === stageNumber);
}

export interface SyllabusContent {
  weeks: SyllabusWeek[];
  checkpoints: SyllabusCheckpoint[];
  source: 'supabase' | 'bundled';
}

function bundledContent(): SyllabusContent {
  return { weeks: syllabus.weeks, checkpoints: syllabus.checkpoints, source: 'bundled' };
}

/** Read the canonical week/checkpoint rows from Supabase, with a safe local fallback. */
export async function loadSyllabusContent(): Promise<SyllabusContent> {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) return bundledContent();

    const [weeksRes, checkpointsRes] = await Promise.all([
      supabase
        .from('syllabus_weeks')
        .select(
          'week_number, stage_number, phase, theme, main_grammar, secondary_grammar_label, secondary_grammar, skills_focus, cefr, grammar, mediation',
        )
        .order('week_number', { ascending: true }),
      supabase
        .from('syllabus_checkpoints')
        .select('checkpoint_number, stage_number, after_week, code, assessed')
        .order('checkpoint_number', { ascending: true }),
    ]);

    if (
      weeksRes.error ||
      checkpointsRes.error ||
      weeksRes.data?.length !== syllabus.course.totalWeeks ||
      checkpointsRes.data?.length !== syllabus.checkpoints.length
    ) {
      return bundledContent();
    }

    const weeks: SyllabusWeek[] = weeksRes.data.map((row) => ({
      number: Number(row.week_number),
      stage: Number(row.stage_number),
      phase: String(row.phase),
      theme: String(row.theme),
      mainGrammar: String(row.main_grammar),
      secondaryGrammarLabel: String(row.secondary_grammar_label),
      secondaryGrammar: row.secondary_grammar ? String(row.secondary_grammar) : null,
      skillsFocus: row.skills_focus ? String(row.skills_focus) : null,
      cefr: (row.cefr ?? syllabus.weeks.find((item) => item.number === Number(row.week_number))?.cefr) as WeekCefr,
      grammar: (row.grammar ?? syllabus.weeks.find((item) => item.number === Number(row.week_number))?.grammar) as SyllabusWeek['grammar'],
      mediation: (row.mediation ?? syllabus.weeks.find((item) => item.number === Number(row.week_number))?.mediation) as SyllabusWeek['mediation'],
    }));

    const checkpoints: SyllabusCheckpoint[] = checkpointsRes.data.map((row) => ({
      number: Number(row.checkpoint_number),
      stage: Number(row.stage_number),
      afterWeek: Number(row.after_week),
      code: String(row.code),
      assessed: String(row.assessed),
    }));

    return { weeks, checkpoints, source: 'supabase' };
  } catch {
    return bundledContent();
  }
}
