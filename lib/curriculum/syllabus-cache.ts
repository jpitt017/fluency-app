import 'server-only';
import { unstable_cache } from 'next/cache';
import { projectInputQuestions } from './input-marking.mjs';
import { createAdminSupabase } from '@/utils/supabase/admin';

const ONE_HOUR = 60 * 60;

export type SafeWeekDetails = {
  title?: string;
  canDo?: string;
  speaking?: {
    prompt?: string;
    cueCard?: string;
    record?: string;
    shadowingChunks?: { chunk: string; listenFor: string; audioUrl?: string }[];
  };
  writing?: { prompt?: string };
};

export type SafeInputItem = {
  mode: string;
  payload: { id: string; question: string; options: string[] };
  sort_order: number;
};

export type SafeSyllabusWeekRow = {
  week_number: number;
  stage_number: number;
  phase: string;
  theme: string;
  main_grammar: string;
  secondary_grammar_label: string;
  secondary_grammar: string | null;
  skills_focus: string | null;
  cefr: { canDo: string; scale: string; level: string } | null;
  grammar: { stretch: boolean; structures: string; marking: string } | null;
  mediation: {
    prompt: string; source: string; output: string; scale: string; level: string;
    time: string; requirement: string; requirementKind: string;
    countsTowardsUnlocking: boolean; feedback: string;
  } | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Allowlist the few detail fields used to render a learner week. In particular,
 * do not retain the DB payload's grammar items, model answers, marking keys,
 * feedback keys, or any other answer-bearing fields in the server cache.
 */
export function projectSafeWeekDetails(value: unknown): SafeWeekDetails | null {
  const root = record(value);
  if (!root) return null;
  const rawSpeaking = record(root.speaking);
  const rawFlow = record(rawSpeaking?.flow);
  const rawWriting = record(root.writing);
  const rawChunks = Array.isArray(rawSpeaking?.shadowingChunks) ? rawSpeaking.shadowingChunks : [];
  const shadowingChunks = rawChunks.flatMap((item) => {
    const chunk = record(item);
    if (!chunk || typeof chunk.chunk !== 'string' || typeof chunk.listenFor !== 'string') return [];
    return [{
      chunk: chunk.chunk,
      listenFor: chunk.listenFor,
      ...(typeof chunk.audioUrl === 'string' ? { audioUrl: chunk.audioUrl } : {}),
    }];
  });
  return {
    ...(stringField(root.title) ? { title: stringField(root.title) } : {}),
    ...(stringField(root.canDo) ? { canDo: stringField(root.canDo) } : {}),
    ...(rawSpeaking ? {
      speaking: {
        ...(stringField(rawSpeaking.prompt) ? { prompt: stringField(rawSpeaking.prompt) } : {}),
        ...(stringField(rawSpeaking.cueCard) ? { cueCard: stringField(rawSpeaking.cueCard) } : {}),
        ...(stringField(rawFlow?.record) ? { record: stringField(rawFlow?.record) } : {}),
        ...(shadowingChunks.length ? { shadowingChunks } : {}),
      },
    } : {}),
    ...(rawWriting && stringField(rawWriting.prompt) ? { writing: { prompt: stringField(rawWriting.prompt) } } : {}),
  };
}

export function projectSafeInputQuestion(value: unknown): SafeInputItem['payload'] | null {
  const item = record(value);
  if (!item || typeof item.id !== 'string' || typeof item.question !== 'string') return null;
  const options = Array.isArray(item.options) && item.options.every((option) => typeof option === 'string')
    ? item.options as string[]
    : [];
  // Keep the shared projection as the final boundary: no key, accepted answer,
  // explanation, or answer association is eligible for caching or serialization.
  return projectInputQuestions([{ id: item.id, question: item.question, options }])[0];
}

export function projectSafeSyllabusWeek(value: Record<string, unknown>): SafeSyllabusWeekRow | null {
  const number = Number(value.week_number);
  if (!Number.isInteger(number) || number < 1 || number > 32) return null;
  const cefr = record(value.cefr);
  const grammar = record(value.grammar);
  const mediation = record(value.mediation);
  const requirementKinds = ['optional', 'either', 'required', 'recommended'];
  const kind = stringField(mediation?.requirementKind);
  return {
    week_number: number,
    stage_number: Number(value.stage_number),
    phase: String(value.phase ?? ''),
    theme: String(value.theme ?? ''),
    main_grammar: String(value.main_grammar ?? ''),
    secondary_grammar_label: String(value.secondary_grammar_label ?? ''),
    secondary_grammar: stringField(value.secondary_grammar) ?? null,
    skills_focus: stringField(value.skills_focus) ?? null,
    cefr: cefr && typeof cefr.canDo === 'string' && typeof cefr.scale === 'string' && typeof cefr.level === 'string'
      ? { canDo: cefr.canDo, scale: cefr.scale, level: cefr.level }
      : null,
    grammar: grammar && typeof grammar.stretch === 'boolean' && typeof grammar.structures === 'string' && typeof grammar.marking === 'string'
      ? { stretch: grammar.stretch, structures: grammar.structures, marking: grammar.marking }
      : null,
    mediation: mediation && kind && requirementKinds.includes(kind) &&
      ['prompt', 'source', 'output', 'scale', 'level', 'time', 'requirement', 'feedback'].every((key) => typeof mediation[key] === 'string') &&
      typeof mediation.countsTowardsUnlocking === 'boolean'
      ? {
          prompt: mediation.prompt as string,
          source: mediation.source as string,
          output: mediation.output as string,
          scale: mediation.scale as string,
          level: mediation.level as string,
          time: mediation.time as string,
          requirement: mediation.requirement as string,
          requirementKind: kind,
          countsTowardsUnlocking: mediation.countsTowardsUnlocking,
          feedback: mediation.feedback as string,
        }
      : null,
  };
}

const cachedSafeWeekDetails = unstable_cache(
  async (weekNumber: number): Promise<SafeWeekDetails | null> => {
    const admin = createAdminSupabase();
    if (!admin) return null;
    const { data, error } = await admin.from('syllabus_week_details_safe')
      .select('payload').eq('week_number', weekNumber).maybeSingle();
    return error || !data ? null : projectSafeWeekDetails(data.payload);
  },
  ['learner-week-details-safe-v1'],
  { revalidate: ONE_HOUR },
);

const cachedSafeInputItems = unstable_cache(
  async (weekNumber: number): Promise<SafeInputItem[] | null> => {
    const admin = createAdminSupabase();
    if (!admin) return null;
    const { data, error } = await admin.from('syllabus_input_items_safe')
      .select('mode,payload,sort_order').eq('week_number', weekNumber).order('sort_order');
    if (error || !data) return null;
    return data.flatMap((row) => {
      const payload = projectSafeInputQuestion(row.payload);
      return payload ? [{ mode: String(row.mode), payload, sort_order: Number(row.sort_order) }] : [];
    });
  },
  ['learner-input-items-safe-v1'],
  { revalidate: ONE_HOUR },
);

const cachedSyllabusWeek = unstable_cache(
  async (weekNumber: number): Promise<SafeSyllabusWeekRow | null> => {
    const admin = createAdminSupabase();
    if (!admin) return null;
    const { data, error } = await admin.from('syllabus_weeks')
      .select('week_number,stage_number,phase,theme,main_grammar,secondary_grammar_label,secondary_grammar,skills_focus,cefr,grammar,mediation')
      .eq('week_number', weekNumber).maybeSingle();
    return error || !data ? null : projectSafeSyllabusWeek(data as unknown as Record<string, unknown>);
  },
  ['learner-syllabus-week-v1'],
  { revalidate: ONE_HOUR },
);

/** Cache keys include the week argument; only allowlisted, learner-invariant data enters the cache. */
export const getCachedSafeWeekDetails = (weekNumber: number) => cachedSafeWeekDetails(weekNumber);
export const getCachedSafeInputItems = (weekNumber: number) => cachedSafeInputItems(weekNumber);
export const getCachedSyllabusWeek = (weekNumber: number) => cachedSyllabusWeek(weekNumber);
