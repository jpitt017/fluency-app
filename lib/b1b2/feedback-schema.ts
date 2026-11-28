import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeSentenceForCompare } from './diff';
import { evaluateAiCorrectionForCard } from './ai-review-card-filter.mjs';
import { UNTRUSTED_DATA_SYSTEM_RULE } from './prompt-guard';

export const ERROR_CATEGORIES = [
  'article',
  'preposition',
  'tense',
  'collocation',
  'word_order',
  'connector',
  'subject_verb',
  'countable_uncountable',
  'modal_verb',
  'spelling',
  'punctuation',
  'word_choice',
  'other',
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
  subject_verb: 'Subject–verb agreement',
  countable_uncountable: 'Countable & uncountable nouns',
  modal_verb: 'Modal verbs & deduction',
  spelling: 'Spelling',
  punctuation: 'Punctuation',
  word_choice: 'Word choice & register',
  other: 'Other language patterns',
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
  subject_verb: 'subject_verb',
  subject_verb_agreement: 'subject_verb',
  agreement: 'subject_verb',
  countable_uncountable: 'countable_uncountable',
  uncountable: 'countable_uncountable',
  countable: 'countable_uncountable',
  modal_verb: 'modal_verb',
  modal_verbs: 'modal_verb',
  modals: 'modal_verb',
  spelling: 'spelling',
  punctuation: 'punctuation',
  word_choice: 'word_choice',
  lexical_choice: 'word_choice',
  vocabulary: 'word_choice',
  other: 'other',
};

export function coerceErrorCategory(value: unknown): ErrorCategory {
  if (typeof value !== 'string') return 'other';
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return CATEGORY_ALIASES[key] ?? 'other';
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
  other_label: z.string().trim().max(80).optional(),
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
  errorPatterns: z.array(z.enum(ERROR_CATEGORIES)).max(8),
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
  errorPatterns: z.array(z.enum(ERROR_CATEGORIES)).max(8),
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

const CATEGORY_LIST_PROMPT = ERROR_CATEGORIES.map((c) => `"${c}"`).join(' | ');

const STRETCH_MARKING_RULE = `- Weeks 12, 25 and 26 include B2+ stretch structures taught for recognition only: inversion and cleft sentences, fronting and emphatic structures, and ellipsis and substitution. Do NOT flag these structures as errors, even when the learner attempts them imperfectly; treat them as optional stretch, not mistakes.
`;

export function buildWritingSystemPrompt(variety: 'British' | 'American' | 'International' = 'British'): string {
  return `You are a CEFR B1 → B2 English writing examiner.
Evaluate the learner's writing on the 5-criterion B1 → B2 rubric (0 to 5, allowing .5 increments).

${UNTRUSTED_DATA_SYSTEM_RULE}

FEEDBACK & TAXONOMY RULES:
${STRETCH_MARKING_RULE}- Write every "explanation" and "feedback" in clear, simple CEFR B1 English so an intermediate learner understands immediately.
- Use British English spelling throughout explanations and feedback (e.g. "colour", "practise" as a verb, "organised", "centre", "programme", "analyse").
- Preferred English variety for the learner's rewritten text: ${variety} English.
- If the learner's text has NO errors, return "corrections": [] and "errorPatterns": []. Do NOT invent mistakes in clean sentences.
- Every item in "corrections" MUST include:
  - "original": the full clause or sentence containing the error (not an isolated 1-word fragment)
  - "corrected_sentence": the natural, accurate B2-ready corrected clause or sentence. The corrected sentence must keep the learner's ideas. Don't add new information or phrases.
  - "error_category": strictly one of ${CATEGORY_LIST_PROMPT}
  - "other_label": ONLY when error_category is "other", provide a short descriptive label (e.g. "relative pronoun omission")
  - "explanation": concise B1-level British English explanation of why the fix is needed
  - "severity": strictly one of "minor" | "moderate" | "major"
  - "rule": short pattern name (e.g. "Subject-verb agreement with collective nouns")

Return strictly valid JSON with no markdown fences matching this schema:
{
  "corrected": "string (natural, polished B2-ready rewrite preserving the learner's intended meaning)",
  "feedback": "string (2-3 encouraging sentences in B1 British English)",
  "notes": ["string (up to 6 concise B1 British English study tips)"],
  "corrections": [
    {
      "original": "string",
      "corrected_sentence": "string",
      "error_category": ${CATEGORY_LIST_PROMPT},
      "other_label": "string (optional, only if error_category is other)",
      "explanation": "string (B1 British English)",
      "severity": "minor" | "moderate" | "major",
      "rule": "string"
    }
  ],
  "errorPatterns": [${CATEGORY_LIST_PROMPT}],
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

${UNTRUSTED_DATA_SYSTEM_RULE}

${STRETCH_MARKING_RULE}
CRITICAL TRANSCRIPTION RULE:
- You are reading an automatic Whisper speech-to-text transcript, NOT listening to raw audio. Whisper automatically fixes mispronounced words into normal spelling.
- Therefore, DO NOT guess or score pronunciation, accent, or phoneme accuracy from the transcript.
- Score ONLY what is reliably observable in the transcript: task_achievement, grammar_accuracy, lexical_range, and coherence (each 0 to 5, allowing .5 increments). Never infer or penalise speaking speed or pauses from the transcript.
- Do not give pronunciation tips or claim that any word was spoken incorrectly. Sound practice is selected by separate fixed rules.
- Write all explanations and feedback in clear, encouraging CEFR B1 British English (using British spelling such as "practise", "organised", "centre").
- If there are no grammatical or lexical errors, return "corrections": [] and "errorPatterns": [].
- For every item in "corrections": The corrected sentence must keep the learner's ideas. Don't add new information or phrases.
- Give exactly one optional sentence-structure upgrade. Its original MUST be an entire sentence copied exactly from the transcript. Preserve the idea, make ONE natural B2 structure and explain it in one short line. Use the week's preferred structure when it fits; otherwise use although, which, so that or because of. The structure field must be exactly one of: although, which, so that, because of, present perfect, time or if clause, modal, passive, conditional, future perfect, past modal.
- For cuePoints, only include a supplied cue-card label when the transcript addresses it; quote the learner's exact words as evidence. Never invent a quotation. Return [] if no labels are supplied.

Return strictly valid JSON with no markdown fences:
{
  "structure": {"original": "exact full sentence from transcript", "upgraded": "one improved sentence", "explanation": "one short B1 line", "structure": "one of the allowed structure names"},
  "cuePoints": [{"label": "supplied cue-card label", "quote": "exact words from transcript"}],
  "improvedResponse": "string (natural B2-ready spoken version preserving the speaker's ideas)",
  "feedback": "string (2-3 encouraging sentences in B1 British English)",
  "strengths": ["string (1-3 concrete strengths in grammar, vocabulary, or organisation)"],
  "improvements": ["string (1-3 specific phrasing or grammar upgrades)"],
  "corrections": [
    {
      "original": "string (full phrase or sentence)",
      "corrected_sentence": "string",
      "error_category": ${CATEGORY_LIST_PROMPT},
      "other_label": "string (optional, only if error_category is other)",
      "explanation": "string (B1 British English)",
      "severity": "minor" | "moderate" | "major",
      "rule": "string"
    }
  ],
  "errorPatterns": [${CATEGORY_LIST_PROMPT}],
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

    // Ignore no-op "corrections" where original === corrected
    if (normalizeSentenceForCompare(original) === normalizeSentenceForCompare(correctedSentence)) {
      continue;
    }

    const category = coerceErrorCategory(obj.error_category ?? obj.category ?? obj.rule);
    const otherLabel =
      category === 'other' && typeof obj.other_label === 'string' && obj.other_label.trim()
        ? obj.other_label.trim().slice(0, 80)
        : undefined;

    const candidate = {
      original: original.slice(0, 300),
      corrected_sentence: correctedSentence.slice(0, 400),
      error_category: category,
      other_label: otherLabel,
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
    errorPatterns: Array.from(patternSet).slice(0, 8),
    rubric,
    score: Math.max(0, Math.min(100, rawScore)),
  };

  return WritingFeedbackSchema.parse(candidate);
}

// A transcript cannot tell us how a word sounded. Filter accidental acoustic
// diagnoses even if a provider ignores the speaking prompt.
function containsAcousticDiagnosis(value: string): boolean {
  return /\b(?:(?:mis)?pron(?:ounc|unci)\w*|accents?|phoneme\w*|(?:sound|sounds|sounded)\s+(?:wrong|incorrect|unclear))\b/i.test(value);
}

export function validateSpeakingFeedback(rawJson: unknown, fallbackTranscript: string): SpeakingFeedback {
  const obj = (rawJson && typeof rawJson === 'object' ? rawJson : {}) as Record<string, unknown>;
  const rawRubric = (obj.rubric && typeof obj.rubric === 'object' ? obj.rubric : {}) as Record<string, unknown>;

  const rubric = {
    task_achievement: clampFive(rawRubric.task_achievement, 3.8),
    lexical_range: clampFive(rawRubric.lexical_range, 3.6),
    grammar_accuracy: clampFive(rawRubric.grammar_accuracy, 3.6),
    coherence: clampFive(rawRubric.coherence, 3.8),
  };

  const avgFive =
    (rubric.task_achievement + rubric.lexical_range + rubric.grammar_accuracy + rubric.coherence) / 4;
  // Never trust an extra overall score that could include imagined audio
  // qualities. Derive it only from the four transcript-observable criteria.
  const computedScore = Math.round((avgFive / 5) * 100);

  const corrections = normalizeCorrectionArray(obj.corrections).filter((item) =>
    !containsAcousticDiagnosis([item.original, item.corrected_sentence, item.explanation, item.rule, item.other_label].filter(Boolean).join(' ')),
  );
  const patternSet = new Set<ErrorCategory>();
  if (Array.isArray(obj.errorPatterns)) {
    for (const p of obj.errorPatterns) {
      if (typeof p === 'string' && !containsAcousticDiagnosis(p)) patternSet.add(coerceErrorCategory(p));
    }
  }
  for (const c of corrections) {
    patternSet.add(c.error_category);
  }

  const improvements = Array.isArray(obj.improvements)
    ? obj.improvements.filter((s): s is string => typeof s === 'string' && s.trim().length > 0 && !containsAcousticDiagnosis(s)).map((s) => s.trim()).slice(0, 4)
    : [];

  const candidate = {
    improvedResponse:
      typeof obj.improvedResponse === 'string' && obj.improvedResponse.trim() && !containsAcousticDiagnosis(obj.improvedResponse)
        ? obj.improvedResponse.trim()
        : fallbackTranscript,
    feedback:
      typeof obj.feedback === 'string' && obj.feedback.trim() && !containsAcousticDiagnosis(obj.feedback)
        ? obj.feedback.trim()
        : 'Clear ideas! Keep linking your sentences with natural B2 connectors.',
    strengths: Array.isArray(obj.strengths)
      ? obj.strengths.filter((s): s is string => typeof s === 'string' && s.trim().length > 0 && !containsAcousticDiagnosis(s)).map((s) => s.trim()).slice(0, 4)
      : [],
    improvements,
    corrections,
    errorPatterns: Array.from(patternSet).slice(0, 8),
    tips: Array.isArray(obj.tips)
      ? obj.tips.filter((s): s is string => typeof s === 'string' && s.trim().length > 0 && !containsAcousticDiagnosis(s)).map((s) => s.trim()).slice(0, 4)
      : improvements,
    rubric,
    score: Math.max(0, Math.min(100, computedScore)),
  };

  return SpeakingFeedbackSchema.parse(candidate);
}

function tokenJaccardSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeSentenceForCompare(a).split(' ').filter(Boolean));
  const setB = new Set(normalizeSentenceForCompare(b).split(' ').filter(Boolean));
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

function findContainingSentence(fullText: string | undefined, fragment: string): string | null {
  if (!fullText) return null;
  const sentences = fullText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const needle = normalizeSentenceForCompare(fragment);
  for (const s of sentences) {
    if (normalizeSentenceForCompare(s).includes(needle)) {
      return s.slice(0, 300);
    }
  }
  return null;
}

const DAILY_NEW_ERROR_CARD_CAP = 5;

const SEVERITY_PRIORITY: Record<ErrorSeverity, number> = {
  major: 3,
  moderate: 2,
  minor: 1,
};

export async function persistLearnerErrors(
  supabase: SupabaseClient,
  params: {
    userId: string;
    sourceType: 'writing' | 'speaking' | 'checkpoint_writing' | 'checkpoint_speaking' | 'mediation';
    sourceId?: string | null;
    lessonId?: string | null;
    sourceText?: string;
    sourceWordCount?: number;
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
    other_label: c.error_category === 'other' ? (c.other_label ?? c.rule ?? null) : null,
    original: c.original,
    corrected: c.corrected_sentence,
    explanation: c.explanation,
    severity: c.severity,
    source_word_count: params.sourceWordCount ?? null,
  }));

  const { data: insertedErrors, error: errInsert } = await supabase
    .from('learner_errors')
    .insert(errorRows)
    .select('id, category, other_label, original, corrected, explanation, severity');

  if (errInsert) {
    console.error('Failed to persist learner_errors:', errInsert.message);
    return;
  }

  // Build quality-checked, deduplicated, daily-capped error review cards
  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);

  const [{ count: createdToday }, { count: queuedFuture }, { data: existingOpen }] = await Promise.all([
    supabase
      .from('error_review_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', params.userId)
      .gte('created_at', startOfUtcDay.toISOString())
      .lt('due_at', new Date(startOfUtcDay.getTime() + 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('error_review_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', params.userId)
      .eq('mastered', false)
      .gte('due_at', new Date(startOfUtcDay.getTime() + 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('error_review_cards')
      .select('id, category, prompt_sentence, corrected_sentence, normalized_key, occurrence_count')
      .eq('user_id', params.userId)
      .eq('mastered', false)
      .order('created_at', { ascending: false })
      .limit(60),
  ]);

  let remainingDailySlots = Math.max(0, DAILY_NEW_ERROR_CARD_CAP - (createdToday ?? 0));
  let overflowQueuedCount = queuedFuture ?? 0;
  const openCards = (existingOpen ?? []) as {
    id: string;
    category: string;
    prompt_sentence: string;
    corrected_sentence?: string | null;
    normalized_key: string | null;
    occurrence_count: number | null;
  }[];

  const sortedErrors = [...(insertedErrors ?? [])].sort((a, b) => {
    const sa = SEVERITY_PRIORITY[coerceSeverity(a.severity)];
    const sb = SEVERITY_PRIORITY[coerceSeverity(b.severity)];
    return sb - sa;
  });

  for (const row of sortedErrors) {
    const containingSentence = findContainingSentence(params.sourceText, row.original);
    const rawOriginal =
      row.original.split(/\s+/).length >= 3
        ? row.original
        : containingSentence ?? row.original;

    const rawCorrected =
      containingSentence && row.original.split(/\s+/).length < 3
        ? containingSentence.replace(row.original, row.corrected)
        : row.corrected;

    // Requirement 7a/7b: only create a Review card for a single-point grammar
    // or vocabulary fix (<= 4 changed words, original <= 25 words, not
    // coherence/organisation/style). Multi-point rewrites stay in feedback only.
    const filtered = evaluateAiCorrectionForCard({
      original: rawOriginal,
      corrected: rawCorrected,
      category: row.category,
      otherLabel: row.other_label ?? null,
      contextSentence: containingSentence && containingSentence !== rawOriginal ? containingSentence : null,
    });
    if (!filtered.ok) continue;

    const promptSentence = filtered.promptSentence;
    const correctedSentence = filtered.correctedSentence;
    const contextSentence = filtered.contextSentence;

    const normKey = normalizeSentenceForCompare(promptSentence);
    if (!normKey) continue;

    // Deduplicate against existing open cards (same category near-identical, or
    // identical prompt+correction across categories so one sentence doesn't spawn duplicates).
    const normCorrected = normalizeSentenceForCompare(correctedSentence);
    const duplicate = openCards.find(
      (c) =>
        (c.category === row.category &&
          (c.normalized_key === normKey || tokenJaccardSimilarity(c.prompt_sentence, promptSentence) >= 0.85))
        || (c.normalized_key === normKey && normalizeSentenceForCompare(c.corrected_sentence ?? '') === normCorrected),
    );

    if (duplicate) {
      await supabase
        .from('error_review_cards')
        .update({
          occurrence_count: (duplicate.occurrence_count ?? 1) + 1,
          due_at: new Date().toISOString(),
        })
        .eq('id', duplicate.id);
      continue;
    }

    // Overflow beyond the 5-card daily cap is queued onto future days (5/day) rather than dropped
    let dueAtIso: string;
    if (remainingDailySlots > 0) {
      remainingDailySlots--;
      dueAtIso = new Date().toISOString();
    } else {
      const overflowIdx = overflowQueuedCount++;
      const futureDays = 1 + Math.floor(overflowIdx / DAILY_NEW_ERROR_CARD_CAP);
      const futureDate = new Date(startOfUtcDay.getTime() + futureDays * 24 * 60 * 60 * 1000);
      futureDate.setUTCHours(8, 0, 0, 0);
      dueAtIso = futureDate.toISOString();
    }

    const cardFormat = 'fix_sentence';
    const { data: created, error: cardErr } = await supabase
      .from('error_review_cards')
      .upsert(
        {
          user_id: params.userId,
          learner_error_id: row.id,
          category: row.category,
          prompt_sentence: promptSentence,
          corrected_sentence: correctedSentence,
          context_sentence: contextSentence,
          card_format: cardFormat,
          normalized_key: normKey,
          explanation: row.explanation,
          due_at: dueAtIso,
        },
        { onConflict: 'user_id,category,normalized_key' },
      )
      .select('id, category, prompt_sentence, corrected_sentence, normalized_key, occurrence_count')
      .maybeSingle();

    if (!cardErr && created) {
      openCards.push(created);
    }
  }
}
