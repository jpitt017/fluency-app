import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const ERROR_CATEGORIES = [
  'article',
  'preposition',
  'tense',
  'collocation',
  'word_order',
  'connector',
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const ERROR_SEVERITIES = ['minor', 'moderate', 'major'] as const;
export type ErrorSeverity = (typeof ERROR_SEVERITIES)[number];

export const ERROR_CATEGORY_LABELS: Record<ErrorCategory, string> = {
  article: 'Articles (a / an / the)',
  preposition: 'Prepositions & dependent prepositions',
  tense: 'Tense & aspect',
  collocation: 'Natural collocations',
  word_order: 'Word order & syntax',
  connector: 'Discourse connectors & linkers',
};

const CATEGORY_ALIASES: Record<string, ErrorCategory> = {
  article: 'article',
  articles: 'article',
  preposition: 'preposition',
  prepositions: 'preposition',
  tense: 'tense',
  tense_aspect: 'tense',
  tenses: 'tense',
  collocation: 'collocation',
  collocations: 'collocation',
  word_order: 'word_order',
  connector: 'connector',
  connectors: 'connector',
  linker: 'connector',
  linkers: 'connector',
};

export function coerceErrorCategory(value: unknown): ErrorCategory {
  if (typeof value !== 'string') return 'collocation';
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return CATEGORY_ALIASES[key] ?? 'collocation';
}

export function coerceSeverity(value: unknown): ErrorSeverity {
  if (typeof value !== 'string') return 'moderate';
  const key = value.trim().toLowerCase();
  if (key === 'minor' || key === 'moderate' || key === 'major') return key;
  return 'moderate';
}

function clampFive(val: unknown, fallback = 3.6): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Number(Math.max(0, Math.min(5, num)).toFixed(1));
}

export const CorrectionItemSchema = z.object({
  original: z.string().trim().min(1).max(300),
  corrected_sentence: z.string().trim().min(1).max(400),
  error_category: z.enum(ERROR_CATEGORIES),
  explanation: z.string().trim().min(1).max(500),
  severity: z.enum(ERROR_SEVERITIES),
  rule: z.string().trim().max(120).optional(),
});

export type CorrectionItem = z.infer<typeof CorrectionItemSchema>;

export const WritingFeedbackSchema = z.object({
  corrected: z.string().trim().min(1),
  feedback: z.string().trim().min(1),
  notes: z.array(z.string().trim().min(1)).max(8),
  corrections: z.array(CorrectionItemSchema).max(10),
  errorPatterns: z.array(z.enum(ERROR_CATEGORIES)).max(6),
  rubric: z.object({
    task_response: z.number().min(0).max(5),
    organisation: z.number().min(0).max(5),
    grammar_accuracy: z.number().min(0).max(5),
    lexical_range: z.number().min(0).max(5),
    style: z.number().min(0).max(5),
  }),
  score: z.number().int().min(0).max(100),
});

export type WritingFeedback = z.infer<typeof WritingFeedbackSchema>;

export const SpeakingFeedbackSchema = z.object({
  improvedResponse: z.string().trim().min(1),
  feedback: z.string().trim().min(1),
  strengths: z.array(z.string().trim().min(1)).max(4),
  improvements: z.array(z.string().trim().min(1)).max(4),
  corrections: z.array(CorrectionItemSchema).max(10),
  errorPatterns: z.array(z.enum(ERROR_CATEGORIES)).max(6),
  tips: z.array(z.string().trim().min(1)).max(4),
  rubric: z.object({
    task_achievement: z.number().min(0).max(5),
    lexical_range: z.number().min(0).max(5),
    grammar_accuracy: z.number().min(0).max(5),
    coherence: z.number().min(0).max(5),
  }),
  score: z.number().int().min(0).max(100),
});

export type SpeakingFeedback = z.infer<typeof SpeakingFeedbackSchema>;

export function buildWritingSystemPrompt(variety: 'British' | 'American' | 'International' = 'British'): string {
  return `You are a CEFR B1 → B2 English writing examiner.
Evaluate the learner's writing on the 5-criterion B1 → B2 rubric (0 to 5, allowing .5 increments).
IMPORTANT RULES FOR FEEDBACK LANGUAGE:
- Write every "explanation" and "feedback" in clear, simple CEFR B1 English so an intermediate learner understands immediately (avoid dense linguistics jargon).
- Use British English spelling throughout explanations and feedback (e.g. "colour", "practise" as a verb, "organised", "centre", "programme", "analyse").
- Preferred English variety for the learner's rewritten text: ${variety} English.
- Every item in "corrections" MUST include:
  - "original": the exact incorrect phrase or sentence from the learner
  - "corrected_sentence": the natural, accurate B2-ready corrected version
  - "error_category": strictly one of "article" | "preposition" | "tense" | "collocation" | "word_order" | "connector"
  - "explanation": concise B1-level British English explanation of why the fix is needed
  - "severity": strictly one of "minor" | "moderate" | "major"
  - "rule": short pattern name (e.g. "Present perfect vs past simple")

Return strictly valid JSON with no markdown fences matching this schema:
{
  "corrected": "string (natural, polished B2-ready rewrite preserving the learner's intended meaning)",
  "feedback": "string (2-3 encouraging sentences in B1 British English)",
  "notes": ["string (up to 6 concise B1 British English study tips)"],
  "corrections": [
    {
      "original": "string",
      "corrected_sentence": "string",
      "error_category": "article" | "preposition" | "tense" | "collocation" | "word_order" | "connector",
      "explanation": "string (B1 British English)",
      "severity": "minor" | "moderate" | "major",
      "rule": "string"
    }
  ],
  "errorPatterns": ["article" | "preposition" | "tense" | "collocation" | "word_order" | "connector"],
  "rubric": {
    "task_response": 4.0,
    "organisation": 3.8,
    "grammar_accuracy": 3.5,
    "lexical_range": 3.7,
    "style": 3.8
  },
  "score": 78
}`;
}

export function buildSpeakingSystemPrompt(): string {
  return `You are a CEFR B1 → B2 English speaking examiner.
CRITICAL TRANSCRIPTION RULE:
- You are reading an automatic Whisper speech-to-text transcript, NOT listening to raw audio. Whisper automatically fixes mispronounced words into normal spelling.
- Therefore, DO NOT guess or score pronunciation, accent, or phoneme accuracy from the transcript.
- Score ONLY what is reliably observable in the transcript: task_achievement, grammar_accuracy, lexical_range, and coherence (each 0 to 5, allowing .5 increments).
- Write all explanations and feedback in clear, encouraging CEFR B1 British English (using British spelling such as "practise", "organised", "centre").

Return strictly valid JSON with no markdown fences:
{
  "improvedResponse": "string (natural B2-ready spoken version preserving the speaker's ideas)",
  "feedback": "string (2-3 encouraging sentences in B1 British English)",
  "strengths": ["string (1-3 concrete strengths in grammar, vocabulary, or organisation)"],
  "improvements": ["string (1-3 specific phrasing or grammar upgrades)"],
  "corrections": [
    {
      "original": "string",
      "corrected_sentence": "string",
      "error_category": "article" | "preposition" | "tense" | "collocation" | "word_order" | "connector",
      "explanation": "string (B1 British English)",
      "severity": "minor" | "moderate" | "major",
      "rule": "string"
    }
  ],
  "errorPatterns": ["article" | "preposition" | "tense" | "collocation" | "word_order" | "connector"],
  "tips": ["string"],
  "rubric": {
    "task_achievement": 3.8,
    "lexical_range": 3.7,
    "grammar_accuracy": 3.6,
    "coherence": 4.0
  },
  "score": 76
}`;
}

function normalizeCorrectionArray(raw: unknown): CorrectionItem[] {
  if (!Array.isArray(raw)) return [];
  const items: CorrectionItem[] = [];
  for (const entry of raw.slice(0, 10)) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const original = typeof obj.original === 'string' ? obj.original.trim() : '';
    const correctedSentence =
      typeof obj.corrected_sentence === 'string'
        ? obj.corrected_sentence.trim()
        : typeof obj.alternative === 'string'
          ? obj.alternative.trim()
          : typeof obj.suggestion === 'string'
            ? obj.suggestion.trim()
            : '';
    const explanation =
      typeof obj.explanation === 'string'
        ? obj.explanation.trim()
        : typeof obj.reason === 'string'
          ? obj.reason.trim()
          : '';
    if (!original || !correctedSentence || !explanation) continue;

    const candidate = {
      original: original.slice(0, 300),
      corrected_sentence: correctedSentence.slice(0, 400),
      error_category: coerceErrorCategory(obj.error_category ?? obj.category ?? obj.rule),
      explanation: explanation.slice(0, 500),
      severity: coerceSeverity(obj.severity),
      rule: typeof obj.rule === 'string' && obj.rule.trim() ? obj.rule.trim().slice(0, 120) : undefined,
    };

    const parsed = CorrectionItemSchema.safeParse(candidate);
    if (parsed.success) {
      items.push(parsed.data);
    }
  }
  return items;
}

export function validateWritingFeedback(rawJson: unknown, fallbackText: string): WritingFeedback {
  const obj = (rawJson && typeof rawJson === 'object' ? rawJson : {}) as Record<string, unknown>;
  const rawRubric = (obj.rubric && typeof obj.rubric === 'object' ? obj.rubric : {}) as Record<string, unknown>;

  const rubric = {
    task_response: clampFive(rawRubric.task_response, 3.8),
    organisation: clampFive(rawRubric.organisation, 3.7),
    grammar_accuracy: clampFive(rawRubric.grammar_accuracy, 3.5),
    lexical_range: clampFive(rawRubric.lexical_range, 3.6),
    style: clampFive(rawRubric.style, 3.7),
  };

  const avgFive =
    (rubric.task_response +
      rubric.organisation +
      rubric.grammar_accuracy +
      rubric.lexical_range +
      rubric.style) /
    5;
  const computedScore = Math.round((avgFive / 5) * 100);
  const rawScore = typeof obj.score === 'number' && Number.isFinite(obj.score) ? Math.round(obj.score) : computedScore;

  const corrections = normalizeCorrectionArray(obj.corrections);
  const patternSet = new Set<ErrorCategory>();
  if (Array.isArray(obj.errorPatterns)) {
    for (const p of obj.errorPatterns) {
      patternSet.add(coerceErrorCategory(p));
    }
  }
  for (const c of corrections) {
    patternSet.add(c.error_category);
  }

  const candidate = {
    corrected: typeof obj.corrected === 'string' && obj.corrected.trim() ? obj.corrected.trim() : fallbackText,
    feedback:
      typeof obj.feedback === 'string' && obj.feedback.trim()
        ? obj.feedback.trim()
        : 'Good effort. Practise reviewing the highlighted grammar and vocabulary notes above.',
    notes: Array.isArray(obj.notes)
      ? obj.notes.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim()).slice(0, 8)
      : [],
    corrections,
    errorPatterns: Array.from(patternSet).slice(0, 6),
    rubric,
    score: Math.max(0, Math.min(100, rawScore)),
  };

  return WritingFeedbackSchema.parse(candidate);
}

export function validateSpeakingFeedback(rawJson: unknown, fallbackTranscript: string): SpeakingFeedback {
  const obj = (rawJson && typeof rawJson === 'object' ? rawJson : {}) as Record<string, unknown>;
  const rawRubric = (obj.rubric && typeof obj.rubric === 'object' ? obj.rubric : {}) as Record<string, unknown>;

  const rubric = {
    task_achievement: clampFive(rawRubric.task_achievement ?? rawRubric.fluency, 3.8),
    lexical_range: clampFive(rawRubric.lexical_range, 3.6),
    grammar_accuracy: clampFive(rawRubric.grammar_accuracy, 3.6),
    coherence: clampFive(rawRubric.coherence, 3.8),
  };

  const avgFive =
    (rubric.task_achievement + rubric.lexical_range + rubric.grammar_accuracy + rubric.coherence) / 4;
  const computedScore = Math.round((avgFive / 5) * 100);
  const rawScore = typeof obj.score === 'number' && Number.isFinite(obj.score) ? Math.round(obj.score) : computedScore;

  const corrections = normalizeCorrectionArray(obj.corrections);
  const patternSet = new Set<ErrorCategory>();
  if (Array.isArray(obj.errorPatterns)) {
    for (const p of obj.errorPatterns) {
      patternSet.add(coerceErrorCategory(p));
    }
  }
  for (const c of corrections) {
    patternSet.add(c.error_category);
  }

  const improvements = Array.isArray(obj.improvements)
    ? obj.improvements.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, 4)
    : [];

  const candidate = {
    improvedResponse:
      typeof obj.improvedResponse === 'string' && obj.improvedResponse.trim()
        ? obj.improvedResponse.trim()
        : fallbackTranscript,
    feedback:
      typeof obj.feedback === 'string' && obj.feedback.trim()
        ? obj.feedback.trim()
        : 'Clear ideas! Keep linking your sentences with natural B2 connectors.',
    strengths: Array.isArray(obj.strengths)
      ? obj.strengths.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, 4)
      : [],
    improvements,
    corrections,
    errorPatterns: Array.from(patternSet).slice(0, 6),
    tips: Array.isArray(obj.tips)
      ? obj.tips.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, 4)
      : improvements,
    rubric,
    score: Math.max(0, Math.min(100, rawScore)),
  };

  return SpeakingFeedbackSchema.parse(candidate);
}

export async function persistLearnerErrors(
  supabase: SupabaseClient,
  params: {
    userId: string;
    sourceType: 'writing' | 'speaking' | 'checkpoint_writing' | 'checkpoint_speaking';
    sourceId?: string | null;
    lessonId?: string | null;
    corrections: CorrectionItem[];
  },
): Promise<void> {
  if (!params.corrections.length) return;

  const errorRows = params.corrections.map((c) => ({
    user_id: params.userId,
    source_type: params.sourceType,
    source_id: params.sourceId || null,
    lesson_id: params.lessonId || null,
    category: c.error_category,
    original: c.original,
    corrected: c.corrected_sentence,
    explanation: c.explanation,
    severity: c.severity,
  }));

  const { data: insertedErrors, error: errInsert } = await supabase
    .from('learner_errors')
    .insert(errorRows)
    .select('id, category, original, corrected, explanation');

  if (errInsert) {
    console.error('Failed to persist learner_errors:', errInsert.message);
    return;
  }

  const cardRows = (insertedErrors ?? []).map((row) => ({
    user_id: params.userId,
    learner_error_id: row.id,
    category: row.category,
    prompt_sentence: row.original,
    corrected_sentence: row.corrected,
    explanation: row.explanation,
    due_at: new Date().toISOString(),
  }));

  if (cardRows.length > 0) {
    const { error: cardErr } = await supabase
      .from('error_review_cards')
      .upsert(cardRows, { onConflict: 'user_id,category,prompt_sentence' });

    if (cardErr) {
      console.error('Failed to upsert error_review_cards:', cardErr.message);
    }
  }
}
