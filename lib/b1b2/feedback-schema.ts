import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeSentenceForCompare } from './diff';
import { evaluateAiCorrectionForCard } from './ai-review-card-filter.mjs';
import { UNTRUSTED_DATA_SYSTEM_RULE } from './prompt-guard';
import {
  LEVEL_RULES_PROMPT_BLOCK,
  MAX_B1B2_SENTENCE_WORDS,
  MAX_CORRECTIONS_PER_TEXT,
  countPlainWords,
  preserveClearLearnerSentences,
  simplifyToB1B2,
  splitSentences,
} from './level-guard.mjs';
import {
  MAX_IMPROVED_HIGHLIGHTS,
  cleanTranscriptionArtifacts,
  isShortOrOffTopicTranscript,
  stripMeaninglessFiller,
  validateImprovedHighlights,
  type ImprovedHighlight,
} from './speaking-feedback.mjs';

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

export const WRITING_AREA_KEYS = [
  'content',
  'communicative_achievement',
  'organisation',
  'language',
] as const;
export type WritingAreaKey = (typeof WRITING_AREA_KEYS)[number];

export const SPEAKING_AREA_KEYS = [
  'grammar_and_vocabulary',
  'discourse_management',
  'pronunciation',
  'interactive_communication',
] as const;
export type SpeakingAreaKey = (typeof SPEAKING_AREA_KEYS)[number];

export const WRITING_AREA_SPECS: Record<
  WritingAreaKey,
  { label: string; question: string; band5: string; band3: string; band1: string }
> = {
  content: {
    label: 'Content',
    question: 'Did you answer every part of the task?',
    band5: 'All parts answered clearly with relevant detail. Fits the reader.',
    band3: 'Most parts answered; one part is thin or missing.',
    band1: 'Important parts missing or off-topic.',
  },
  communicative_achievement: {
    label: 'Communicative achievement',
    question: 'Does it sound right for your reader?',
    band5: "Right tone and format (email, article, story). Holds the reader's interest.",
    band3: 'Mostly the right tone; format works.',
    band1: 'Wrong tone or format; hard to read as that text type.',
  },
  organisation: {
    label: 'Organisation',
    question: 'Is it easy to follow?',
    band5: 'Clear paragraphs and smooth linking.',
    band3: 'Grouped ideas and simple linkers, with a few jumps.',
    band1: 'Little order; few or misused linkers.',
  },
  language: {
    label: 'Language',
    question: 'Are your grammar and words clear?',
    band5: "Good B1+ range; tries the week's grammar; errors don't confuse.",
    band3: 'Everyday words and simple grammar; some errors, meaning clear.',
    band1: 'Frequent basic errors sometimes hide the meaning.',
  },
};

export const SPEAKING_AREA_SPECS: Record<
  SpeakingAreaKey,
  {
    label: string;
    question: string;
    markedBy: 'AI' | 'Teacher only' | 'AI in Discuss and decide only';
    band5: string;
    band3: string;
    band1: string;
  }
> = {
  grammar_and_vocabulary: {
    label: 'Grammar and vocabulary',
    question: 'Did you use clear grammar and the right words?',
    markedBy: 'AI',
    band5: "Good everyday vocabulary; tries the week's grammar; errors don't block meaning.",
    band3: 'Simple grammar and vocabulary; errors are noticeable, main point is clear.',
    band1: 'Very limited words or frequent errors make the message hard to follow.',
  },
  discourse_management: {
    label: 'Discourse management',
    question: 'Did you speak for long enough and link your ideas?',
    markedBy: 'AI',
    band5: 'Full answer for the task length, relevant, connected with simple linkers.',
    band3: 'Answers the prompt but briefly, or repeats a couple of linkers.',
    band1: 'Very short turns or unconnected fragments.',
  },
  pronunciation: {
    label: 'Pronunciation',
    question: 'Could people understand you easily?',
    markedBy: 'Teacher only',
    band5: 'Easy to understand throughout; clear stress and endings.',
    band3: 'Mostly clear, with occasional effort needed on stress or sounds.',
    band1: 'Often hard to understand.',
  },
  interactive_communication: {
    label: 'Interactive communication',
    question: 'Did you answer your partner and keep the talk going?',
    markedBy: 'AI in Discuss and decide only',
    band5: "Responds to the partner's point, asks back or invites their view, helps reach a choice.",
    band3: "Answers what's asked and takes turns, rarely builds on the partner's idea.",
    band1: 'One-word replies or talks past the partner.',
  },
};

export const OVER_WORD_LIMIT_TIP = 'Try to keep to 100–120 words.';
export const SHORT_OR_OFF_TOPIC_MESSAGE = 'Try again using this example to help you.';

const WEEK_PRIORITY_CATEGORIES: Record<number, ErrorCategory[]> = {
  1: ['tense', 'connector', 'collocation'],
  2: ['tense', 'connector', 'modal_verb'],
  3: ['modal_verb', 'word_order', 'connector'],
  4: ['tense', 'article', 'word_choice', 'connector'],
};

export const WEEK_SPEAKING_TARGET_STRUCTURES: Record<number, string[]> = {
  1: [
    'past simple for finished past events',
    'present perfect with since then, for, or already',
    'used to for past habits or states',
    'get used to + -ing and linkers like although or eventually',
  ],
  2: [
    'going to or intend to for plans and intentions',
    'present continuous for fixed arrangements',
    'first conditional or future time clauses with when, if, or as soon as',
    'look forward to + -ing',
  ],
  3: [
    'have to / must for rules and shared jobs',
    "don't have to for things that are optional",
    "mustn't / aren't allowed to for things that are not allowed",
    'should for friendly advice, plus linkers like on the other hand or apart from that',
  ],
  4: [
    'present and past simple passive (is held, was built)',
    'relative clauses with which or where',
    'comparatives and superlatives (quieter than, one of the friendliest)',
    'linkers like to begin with and all in all',
  ],
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

export function clampAreaBand(val: unknown, fallback = 3): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(5, Math.round(num)));
}

function oneB1Sentence(
  raw: unknown,
  fallback: string,
  options: { weekNumber?: number | null; stripPronunciation?: boolean } = {},
): string {
  const text = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!text) return fallback;
  if (options.stripPronunciation && /\b(?:(?:mis)?pron(?:ounc|unci)\w*|accents?|phoneme\w*|intonation)\b/i.test(text)) {
    return fallback;
  }
  const first = splitSentences(text)[0] ?? text;
  const simplified = simplifyToB1B2(first, {
    weekNumber: options.weekNumber,
    maxSentenceWords: MAX_B1B2_SENTENCE_WORDS,
  });
  const single = splitSentences(simplified)[0] ?? simplified;
  if (!single) return fallback;
  return /[.!?]$/.test(single) ? single : `${single}.`;
}

export const AreaFeedbackSchema = z.object({
  score: z.number().int().min(0).max(5),
  strength: z.string().trim().min(1).max(260),
  improvement: z.string().trim().min(1).max(260),
});

export type AreaFeedback = z.infer<typeof AreaFeedbackSchema>;

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
  corrections: z.array(CorrectionItemSchema).max(MAX_CORRECTIONS_PER_TEXT),
  errorPatterns: z.array(z.enum(ERROR_CATEGORIES)).max(8),
  areas: z.object({
    content: AreaFeedbackSchema,
    communicative_achievement: AreaFeedbackSchema,
    organisation: AreaFeedbackSchema,
    language: AreaFeedbackSchema,
  }),
  wordCount: z.number().int().min(0),
  contentCappedUnder100: z.boolean(),
  wordCountTip: z.string().nullable(),
});

export type WritingFeedback = z.infer<typeof WritingFeedbackSchema>;

export const ImprovedHighlightSchema = z.object({
  substring: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(70),
  explanation: z.string().trim().min(1).max(180),
  before: z.string().trim().max(160).optional(),
});

export const SpeakingFeedbackSchema = z.object({
  cleanedTranscript: z.string().trim(),
  repairedWords: z.array(z.string()),
  nextStep: z.string().trim().min(1),
  improvedResponse: z.string().trim().min(1),
  highlights: z.array(ImprovedHighlightSchema).max(MAX_IMPROVED_HIGHLIGHTS),
  showExampleFirst: z.boolean(),
  examplePromptMessage: z.string().nullable(),
  offTopic: z.boolean(),
  feedback: z.string().trim().min(1),
  strengths: z.array(z.string().trim().min(1)).max(4),
  improvements: z.array(z.string().trim().min(1)).max(4),
  corrections: z.array(CorrectionItemSchema).max(MAX_CORRECTIONS_PER_TEXT),
  errorPatterns: z.array(z.enum(ERROR_CATEGORIES)).max(8),
  tips: z.array(z.string().trim().min(1)).max(4),
  areas: z.object({
    grammar_and_vocabulary: AreaFeedbackSchema,
    discourse_management: AreaFeedbackSchema,
    pronunciation: z.null(),
    interactive_communication: AreaFeedbackSchema.nullable(),
  }),
});

export type SpeakingFeedback = z.infer<typeof SpeakingFeedbackSchema>;

export interface WritingWeekGoals {
  weekNumber?: number | null;
  readerAndPurpose?: string;
  requiredPoints?: string[];
  linkers?: string[];
  grammar?: string;
  featuredWords?: string[];
  inputContext?: string;
}

export interface SpeakingPromptOptions {
  weekNumber?: number | null;
  includeInteractive?: boolean;
  partLabel?: string;
  optionsList?: string[];
  decisionTask?: string;
}

const CATEGORY_LIST_PROMPT = ERROR_CATEGORIES.map((c) => `"${c}"`).join(' | ');

const STRETCH_MARKING_RULE = `- Weeks 12, 25 and 26 include B2+ stretch structures taught for recognition only: inversion and cleft sentences, fronting and emphatic structures, and ellipsis and substitution. Do NOT flag these structures as errors, even when the learner attempts them imperfectly; treat them as optional stretch, not mistakes.
`;

export function buildWritingSystemPrompt(
  variety: 'British' | 'American' | 'International' = 'British',
  weekGoals?: WritingWeekGoals,
): string {
  const weekChecksBlock = weekGoals
    ? [
        '\nWEEK GOALS (use these as checks inside Content, Communicative achievement, Organisation, and Language — NEVER as separate marks):',
        weekGoals.inputContext ? `- Task input shown to the learner:\n${weekGoals.inputContext}` : '',
        weekGoals.requiredPoints?.length
          ? `- Required points (feed into Content): ${weekGoals.requiredPoints.join('; ')}`
          : '',
        weekGoals.readerAndPurpose
          ? `- Reader and tone (feed into Communicative achievement): ${weekGoals.readerAndPurpose}`
          : '',
        weekGoals.linkers?.length
          ? `- Target linkers (feed into Organisation): ${weekGoals.linkers.join(', ')}`
          : '',
        weekGoals.grammar
          ? `- Week's target grammar (feed into Language & put mistakes here first in corrections): ${weekGoals.grammar}`
          : '',
        weekGoals.featuredWords?.length
          ? `- Week's featured words (feed into Language): ${weekGoals.featuredWords.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return `You are a helpful English writing teacher preparing learners for B1 Preliminary and B2 First formats.
Mark the learner's writing on FOUR areas (0 to 5 whole numbers only; NO overall score):
1. "content" — "${WRITING_AREA_SPECS.content.question}"
   - 5: ${WRITING_AREA_SPECS.content.band5}
   - 3: ${WRITING_AREA_SPECS.content.band3}
   - 1: ${WRITING_AREA_SPECS.content.band1}
2. "communicative_achievement" — "${WRITING_AREA_SPECS.communicative_achievement.question}"
   - 5: ${WRITING_AREA_SPECS.communicative_achievement.band5}
   - 3: ${WRITING_AREA_SPECS.communicative_achievement.band3}
   - 1: ${WRITING_AREA_SPECS.communicative_achievement.band1}
3. "organisation" — "${WRITING_AREA_SPECS.organisation.question}"
   - 5: ${WRITING_AREA_SPECS.organisation.band5}
   - 3: ${WRITING_AREA_SPECS.organisation.band3}
   - 1: ${WRITING_AREA_SPECS.organisation.band1}
4. "language" — "${WRITING_AREA_SPECS.language.question}"
   - 5: ${WRITING_AREA_SPECS.language.band5}
   - 3: ${WRITING_AREA_SPECS.language.band3}
   - 1: ${WRITING_AREA_SPECS.language.band1}
${weekChecksBlock}

${UNTRUSTED_DATA_SYSTEM_RULE}

${LEVEL_RULES_PROMPT_BLOCK}

FEEDBACK & CORRECTION RULES:
${STRETCH_MARKING_RULE}- Write every "strength", "improvement", "explanation", and "feedback" in plain B1 English (one short sentence each for "strength" and "improvement").
- Never claim to be official or endorsed by Cambridge, and avoid technical linguistic jargon.
- Use British English spelling in feedback ("colour", "practise" as a verb, "organised", "centre", "programme").
- Preferred English variety for "corrected": ${variety} English.
- Word count rules (Weeks 1–8): target is 100–120 words. Under 80 words caps "content" at 3. Over 150 words includes the tip "${OVER_WORD_LIMIT_TIP}".
- If the learner's text has NO errors, return "corrections": [] and "errorPatterns": []. Keep clear, correct sentences exactly as they are.
- Return AT MOST 3 items in "corrections", putting mistakes with this week's grammar first.
- Every item in "corrections" MUST include:
  - "original": the full clause or sentence containing the error (not an isolated 1-word fragment)
  - "corrected_sentence": the clean B1–B2 rewrite of that clause/sentence (at most 20 words, B1–B2 words only, different from "original"). The corrected sentence must keep the learner's ideas. Don't add new information or phrases.
  - "error_category": ONE of ${CATEGORY_LIST_PROMPT}
  - "other_label": ONLY when error_category is "other"
  - "explanation": 1 plain B1 sentence explaining WHY and HOW to fix it
  - "severity": "minor" | "moderate" | "major"
  - "rule": optional short pattern name

Return ONLY valid JSON with this exact structure (no overall score):
{
  "areas": {
    "content": { "score": 4, "strength": "One plain B1 sentence.", "improvement": "One plain B1 sentence." },
    "communicative_achievement": { "score": 4, "strength": "One plain B1 sentence.", "improvement": "One plain B1 sentence." },
    "organisation": { "score": 4, "strength": "One plain B1 sentence.", "improvement": "One plain B1 sentence." },
    "language": { "score": 4, "strength": "One plain B1 sentence.", "improvement": "One plain B1 sentence." }
  },
  "feedback": "1–2 encouraging plain B1 sentences.",
  "corrected": "The learner's text with errors fixed, keeping clear sentences as they are, B1–B2 words only, max 20 words per sentence.",
  "notes": ["1–3 short practical B1 tips"],
  "corrections": [
    {
      "original": "Exact flawed clause or sentence from the learner's text",
      "corrected_sentence": "Natural B1–B2 corrected version (<= 20 words)",
      "error_category": "tense",
      "explanation": "Plain B1 explanation of why and how to fix it.",
      "severity": "moderate"
    }
  ],
  "errorPatterns": ["tense"]
}`;
}

export function buildSpeakingSystemPrompt(
  prompt: string,
  variety: 'British' | 'American' | 'International' = 'British',
  options: SpeakingPromptOptions = {},
): string {
  const wk = options.weekNumber && WEEK_SPEAKING_TARGET_STRUCTURES[options.weekNumber]
    ? options.weekNumber
    : null;
  const weekStructures = wk
    ? WEEK_SPEAKING_TARGET_STRUCTURES[wk]
    : [
        'past simple and present perfect',
        'future plans with going to or first conditional',
        "modals like have to, don't have to, and should",
        'relative clauses with which or where, and simple linkers',
      ];
  const interactiveBlock = options.includeInteractive
    ? `3. "interactive_communication" — "${SPEAKING_AREA_SPECS.interactive_communication.question}" (0 to 5 whole number)
   - 5: ${SPEAKING_AREA_SPECS.interactive_communication.band5}
   - 3: ${SPEAKING_AREA_SPECS.interactive_communication.band3}
   - 1: ${SPEAKING_AREA_SPECS.interactive_communication.band1}
${options.optionsList?.length ? `- Discuss-and-decide options: ${options.optionsList.join(' · ')} (${options.decisionTask ?? 'agree on the best choice'})` : ''}`
    : '- Set "interactive_communication": null (only marked in Discuss and decide).';

  const interactiveJsonExample = options.includeInteractive
    ? '{ "score": 4, "strength": "One plain B1 sentence.", "improvement": "One plain B1 sentence." }'
    : 'null';

  return `You are a helpful English speaking teacher preparing learners for B1 Preliminary and B2 First formats.
Prompt given to the learner: "${prompt}"${options.partLabel ? ` (${options.partLabel})` : ''}

${UNTRUSTED_DATA_SYSTEM_RULE}

CRITICAL SPEAKING TRANSCRIPT RULES:
- You ONLY receive a speech-to-text transcript (from Whisper), NOT raw audio.
- DO NOT guess or score pronunciation, word stress, intonation, or accent. Pronunciation is marked by a teacher only — NEVER mention pronunciation in any field.
- Never infer or penalise speaking speed or pauses from punctuation or transcript length.
- Before giving feedback, spot obvious speech-to-text transcription mistakes (for example "TV stroke podcast" -> "TV/podcast", or "a state" -> "an estate" when context shows a country/housing estate) and list them in "transcriptionFixes": [{ "heard": "TV stroke podcast", "intended": "TV/podcast" }]. Silently use the intended words in "improvedResponse" and NEVER treat transcription mistakes as learner errors.
${STRETCH_MARKING_RULE}
${LEVEL_RULES_PROMPT_BLOCK}
- For every item in "corrections": The corrected sentence must keep the learner's ideas. Don't add new information or phrases.

AREAS TO MARK (0 to 5 whole numbers; NO overall score, NO pronunciation mark):
1. "grammar_and_vocabulary" — "${SPEAKING_AREA_SPECS.grammar_and_vocabulary.question}"
   - 5: ${SPEAKING_AREA_SPECS.grammar_and_vocabulary.band5}
   - 3: ${SPEAKING_AREA_SPECS.grammar_and_vocabulary.band3}
   - 1: ${SPEAKING_AREA_SPECS.grammar_and_vocabulary.band1}
2. "discourse_management" — "${SPEAKING_AREA_SPECS.discourse_management.question}"
   - 5: ${SPEAKING_AREA_SPECS.discourse_management.band5}
   - 3: ${SPEAKING_AREA_SPECS.discourse_management.band3}
   - 1: ${SPEAKING_AREA_SPECS.discourse_management.band1}
${interactiveBlock}
- Write every "strength" and "improvement" as ONE plain B1 sentence in British English.

"YOUR ANSWER, IMPROVED" ("improvedResponse" & "highlights"):
- Rewrite the learner's own spoken answer into ONE clean version in "improvedResponse":
  - Keep ONLY their ideas; do NOT add new facts, places, people, or details they did not mention.
  - Fix real errors and keep clear, natural learner sentences as they are.
  - Every change MUST fix an error or add one of this week's structures. NEVER add filler with no meaning (for example NEVER add "which is something I want to talk about").
  - Keep roughly the same length (within about 20% of their word count when they spoke 20+ words).
  - Use ${variety} English, B1–B2 words only, and sentences of at most 20 words.
  - Naturally use up to 3 of these target structures where they genuinely fit the learner's ideas:
${weekStructures.map((s) => `    * ${s}`).join('\n')}
- Return AT MOST 3 changed phrases in "highlights" (only phrases that actually changed compared with what the learner said):
  - "substring": an EXACT verbatim changed substring copied character-for-character from "improvedResponse"
  - "before": the learner's original wording that changed (optional if added cleanly)
  - "label": short B1 label (2–4 words, e.g. "Present perfect with since")
  - "explanation": one-line plain B1 reason why this change helps (1 short sentence)
- Return "nextStep": ONE short plain B1 sentence telling the learner one clear thing to try next time.
- Set "offTopic": true ONLY if the learner's transcript has nothing to do with the prompt.

CORRECTIONS:
- Return AT MOST 3 items in "corrections", putting mistakes with this week's grammar first (never include speech-to-text transcription slips).
- Each correction needs "original", "corrected_sentence" (<= 20 words, B1–B2 words only), "error_category" (${CATEGORY_LIST_PROMPT}), "explanation" (1 plain B1 sentence), and "severity".

Return ONLY valid JSON with this exact structure (no overall score, no pronunciation field):
{
  "transcriptionFixes": [
    { "heard": "TV stroke podcast", "intended": "TV/podcast" }
  ],
  "areas": {
    "grammar_and_vocabulary": { "score": 4, "strength": "One plain B1 sentence.", "improvement": "One plain B1 sentence." },
    "discourse_management": { "score": 4, "strength": "One plain B1 sentence.", "improvement": "One plain B1 sentence." },
    "interactive_communication": ${interactiveJsonExample}
  },
  "offTopic": false,
  "feedback": "1–2 encouraging plain B1 sentences.",
  "nextStep": "One clear B1 thing to try next time.",
  "improvedResponse": "The learner's own ideas with errors fixed, no filler, within ~20% length, B1–B2 words only, <= 20 words per sentence.",
  "highlights": [
    {
      "substring": "exact changed substring from improvedResponse",
      "before": "what the learner said",
      "label": "Short B1 label",
      "explanation": "One-line plain B1 reason."
    }
  ],
  "strengths": ["1–2 short strengths"],
  "improvements": ["1–2 short improvements"],
  "tips": ["1–2 practical tips"],
  "corrections": [
    {
      "original": "Exact flawed spoken clause or sentence",
      "corrected_sentence": "Natural spoken B1–B2 version (<= 20 words)",
      "error_category": "tense",
      "explanation": "Plain B1 explanation.",
      "severity": "moderate"
    }
  ],
  "errorPatterns": ["tense"]
}`;
}

function sanitizeCorrections(
  rawList: unknown,
  options: {
    learnerText?: string;
    weekNumber?: number | null;
    stripPronunciation?: boolean;
  } = {},
): CorrectionItem[] {
  if (!Array.isArray(rawList)) return [];
  const valid: CorrectionItem[] = [];
  const priority = new Set(
    options.weekNumber ? WEEK_PRIORITY_CATEGORIES[options.weekNumber] ?? [] : [],
  );

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const original = String(rec.original ?? '').trim();
    const rawCorrected = String(rec.corrected_sentence ?? rec.alternative ?? rec.corrected ?? '').trim();
    const rawExplanation = String(rec.explanation ?? rec.reason ?? '').trim();

    if (!original || !rawCorrected || !rawExplanation) continue;
    if (
      options.stripPronunciation &&
      /\b(?:(?:mis)?pron(?:ounc|unci)\w*|accents?|phoneme\w*|intonation)\b/i.test(rawExplanation)
    ) {
      continue;
    }

    const corrected_sentence = simplifyToB1B2(rawCorrected, {
      weekNumber: options.weekNumber,
      learnerText: options.learnerText,
      maxSentenceWords: MAX_B1B2_SENTENCE_WORDS,
    });
    const explanation = oneB1Sentence(rawExplanation, 'Use this clearer B1 form here.', {
      weekNumber: options.weekNumber,
      stripPronunciation: options.stripPronunciation,
    });

    if (!corrected_sentence) continue;
    if (normalizeSentenceForCompare(original) === normalizeSentenceForCompare(corrected_sentence)) {
      continue;
    }

    const error_category = coerceErrorCategory(rec.error_category ?? rec.category ?? rec.type);
    const severity = coerceSeverity(rec.severity);
    const other_label =
      error_category === 'other' && typeof rec.other_label === 'string' && rec.other_label.trim()
        ? rec.other_label.trim().slice(0, 80)
        : undefined;
    const rule =
      typeof rec.rule === 'string' && rec.rule.trim() ? rec.rule.trim().slice(0, 120) : undefined;

    valid.push({
      original: original.slice(0, 300),
      corrected_sentence: corrected_sentence.slice(0, 400),
      error_category,
      ...(other_label ? { other_label } : {}),
      explanation: explanation.slice(0, 500),
      severity,
      ...(rule ? { rule } : {}),
    });
  }

  // Week's target grammar mistakes first, preserving relative order otherwise, capped at 3
  const prioritized = [
    ...valid.filter((item) => priority.has(item.error_category)),
    ...valid.filter((item) => !priority.has(item.error_category)),
  ];
  return prioritized.slice(0, MAX_CORRECTIONS_PER_TEXT);
}

export function validateWritingFeedback(
  raw: unknown,
  originalText: string,
  options: { weekNumber?: number | null; skipUnder100Cap?: boolean } = {},
): WritingFeedback {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawAreas = obj.areas && typeof obj.areas === 'object' ? (obj.areas as Record<string, unknown>) : {};
  const legacyRubric = obj.rubric && typeof obj.rubric === 'object' ? (obj.rubric as Record<string, unknown>) : {};

  const wordCount = countPlainWords(originalText);
  const isWeeks9Plus = typeof options.weekNumber === 'number' && options.weekNumber > 8;
  const minUncappedWords = isWeeks9Plus ? 100 : 80;
  const maxWordsBeforeTip = isWeeks9Plus ? 180 : 150;
  const wordLimitTipText = isWeeks9Plus
    ? 'Try to keep to 120–150 words.'
    : OVER_WORD_LIMIT_TIP;
  const contentCappedUnder100 = !options.skipUnder100Cap && wordCount > 0 && wordCount < minUncappedWords;
  const wordCountTip = wordCount > maxWordsBeforeTip ? wordLimitTipText : null;

  function parseArea(
    key: WritingAreaKey,
    legacyKey: string,
    defaultStrength: string,
    defaultImprovement: string,
  ): AreaFeedback {
    const areaObj =
      rawAreas[key] && typeof rawAreas[key] === 'object'
        ? (rawAreas[key] as Record<string, unknown>)
        : {};
    let score = clampAreaBand(areaObj.score ?? areaObj.mark ?? legacyRubric[legacyKey], 3);
    if (key === 'content' && contentCappedUnder100 && score > 3) {
      score = 3;
    }
    const improvementFallback =
      key === 'content' && contentCappedUnder100
        ? isWeeks9Plus
          ? 'Add more detail so you reach 120–150 words and cover every part.'
          : 'Add a little more detail so you reach 100–120 words and cover every part.'
        : defaultImprovement;
    return {
      score,
      strength: oneB1Sentence(areaObj.strength, defaultStrength, { weekNumber: options.weekNumber }),
      improvement: oneB1Sentence(areaObj.improvement, improvementFallback, {
        weekNumber: options.weekNumber,
      }),
    };
  }

  const areas = {
    content: parseArea(
      'content',
      'task_response',
      'You answered the main topic clearly.',
      'Develop every part of the task with a clear detail.',
    ),
    communicative_achievement: parseArea(
      'communicative_achievement',
      'style',
      'Your tone fits the reader well.',
      'Keep a friendly, natural style from start to finish.',
    ),
    organisation: parseArea(
      'organisation',
      'organisation',
      'Your ideas follow a sensible order.',
      'Use clear paragraphs and simple linking words between points.',
    ),
    language: parseArea(
      'language',
      'grammar_accuracy',
      'Your meaning is clear to the reader.',
      'Check verb forms and articles in your longer sentences.',
    ),
  };

  const corrections = sanitizeCorrections(obj.corrections, {
    learnerText: originalText,
    weekNumber: options.weekNumber,
  });
  const derivedPatterns = Array.from(new Set(corrections.map((c) => c.error_category)));
  const rawPatterns = Array.isArray(obj.errorPatterns)
    ? obj.errorPatterns
        .map(coerceErrorCategory)
        .filter((c, idx, arr) => arr.indexOf(c) === idx)
        .slice(0, 8)
    : [];
  const errorPatterns = corrections.length > 0 ? derivedPatterns : rawPatterns;

  const rawNotes = Array.isArray(obj.notes)
    ? obj.notes
        .map((n) =>
          simplifyToB1B2(String(n).trim(), {
            weekNumber: options.weekNumber,
            maxSentenceWords: MAX_B1B2_SENTENCE_WORDS,
          }),
        )
        .filter(Boolean)
        .slice(0, 7)
    : [];
  const notes = wordCountTip
    ? [wordCountTip, ...rawNotes.filter((n) => n !== wordCountTip)].slice(0, 8)
    : rawNotes;

  const rawCorrected =
    typeof obj.corrected === 'string' && obj.corrected.trim()
      ? obj.corrected.trim()
      : originalText.trim() || 'No text submitted.';
  const simplifiedCorrected = simplifyToB1B2(rawCorrected, {
    weekNumber: options.weekNumber,
    learnerText: originalText,
    maxSentenceWords: MAX_B1B2_SENTENCE_WORDS,
  });
  const corrected =
    preserveClearLearnerSentences(originalText, simplifiedCorrected, corrections, {
      weekNumber: options.weekNumber,
    }) ||
    originalText.trim() ||
    'No text submitted.';

  const rawFeedback =
    typeof obj.feedback === 'string' && obj.feedback.trim()
      ? simplifyToB1B2(obj.feedback.trim(), {
          weekNumber: options.weekNumber,
          maxSentenceWords: MAX_B1B2_SENTENCE_WORDS,
        })
      : 'Good effort on this task. Read the four area notes below to plan your next draft.';

  return WritingFeedbackSchema.parse({
    corrected,
    feedback: rawFeedback || 'Good effort on this task.',
    notes,
    corrections,
    errorPatterns,
    areas,
    wordCount,
    contentCappedUnder100,
    wordCountTip,
  });
}

function clampLengthNearTranscript(improved: string, transcript: string): string {
  const transcriptWords = countPlainWords(transcript);
  if (transcriptWords < 20) return improved;
  const maxAllowedWords = Math.max(transcriptWords + 10, Math.ceil(transcriptWords * 1.25));
  if (countPlainWords(improved) <= maxAllowedWords) return improved;

  const sentences = splitSentences(improved);
  if (sentences.length <= 1) return improved;
  const minAllowedWords = Math.max(15, Math.floor(transcriptWords * 0.8));
  const kept: string[] = [];
  let running = 0;
  for (const s of sentences) {
    const wc = countPlainWords(s);
    if (running >= minAllowedWords && running + wc > maxAllowedWords) break;
    kept.push(s);
    running += wc;
  }
  return kept.join(' ').trim() || improved;
}

export function validateSpeakingFeedback(
  raw: unknown,
  originalTranscript: string,
  options: { weekNumber?: number | null; includeInteractive?: boolean } = {},
): SpeakingFeedback {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawAreas = obj.areas && typeof obj.areas === 'object' ? (obj.areas as Record<string, unknown>) : {};
  const legacyRubric = obj.rubric && typeof obj.rubric === 'object' ? (obj.rubric as Record<string, unknown>) : {};

  const pronunciationClaim = /\b(?:(?:mis)?pron(?:ounc|unci)\w*|accents?|phoneme\w*|intonation)\b/i;
  const cleanList = (items: unknown, limit = 4) =>
    Array.isArray(items)
      ? items
          .map((item) =>
            simplifyToB1B2(String(item).trim(), {
              weekNumber: options.weekNumber,
              maxSentenceWords: MAX_B1B2_SENTENCE_WORDS,
            }),
          )
          .filter((item) => Boolean(item) && !pronunciationClaim.test(item))
          .slice(0, limit)
      : [];

  function parseSpeakingArea(
    key: 'grammar_and_vocabulary' | 'discourse_management' | 'interactive_communication',
    legacyFallbackScore: unknown,
    defaultStrength: string,
    defaultImprovement: string,
  ): AreaFeedback {
    const areaObj =
      rawAreas[key] && typeof rawAreas[key] === 'object'
        ? (rawAreas[key] as Record<string, unknown>)
        : {};
    return {
      score: clampAreaBand(areaObj.score ?? areaObj.mark ?? legacyFallbackScore, 3),
      strength: oneB1Sentence(areaObj.strength, defaultStrength, {
        weekNumber: options.weekNumber,
        stripPronunciation: true,
      }),
      improvement: oneB1Sentence(areaObj.improvement, defaultImprovement, {
        weekNumber: options.weekNumber,
        stripPronunciation: true,
      }),
    };
  }

  const legacyGv =
    Number.isFinite(Number(legacyRubric.grammar_accuracy)) &&
    Number.isFinite(Number(legacyRubric.lexical_range))
      ? (Number(legacyRubric.grammar_accuracy) + Number(legacyRubric.lexical_range)) / 2
      : legacyRubric.grammar_accuracy ?? legacyRubric.lexical_range;
  const legacyDm =
    Number.isFinite(Number(legacyRubric.coherence)) &&
    Number.isFinite(Number(legacyRubric.task_achievement))
      ? (Number(legacyRubric.coherence) + Number(legacyRubric.task_achievement)) / 2
      : legacyRubric.coherence ?? legacyRubric.task_achievement;

  const areas = {
    grammar_and_vocabulary: parseSpeakingArea(
      'grammar_and_vocabulary',
      legacyGv,
      'You used clear everyday words to share your ideas.',
      "Try adding one of this week's target grammar forms next time.",
    ),
    discourse_management: parseSpeakingArea(
      'discourse_management',
      legacyDm,
      'You stayed on the topic and connected your main points.',
      'Add a simple linking phrase like although or since then to join ideas.',
    ),
    // Pronunciation is NEVER marked by the AI (teacher only).
    pronunciation: null,
    // Interactive communication is marked by AI ONLY in "Discuss and decide".
    interactive_communication: options.includeInteractive
      ? parseSpeakingArea(
          'interactive_communication',
          undefined,
          "You answered your partner's points and helped move the talk forward.",
          'Invite your partner to share their view before choosing together.',
        )
      : null,
  };

  const { cleanedTranscript, repairedWords } = cleanTranscriptionArtifacts(
    originalTranscript,
    Array.isArray(obj.transcriptionFixes)
      ? (obj.transcriptionFixes as Array<{ heard: string; intended: string }>)
      : null,
  );
  const repairedSet = new Set(repairedWords.map((w) => w.toLowerCase()));

  const rawSanitizedCorrections = sanitizeCorrections(obj.corrections, {
    learnerText: cleanedTranscript,
    weekNumber: options.weekNumber,
    stripPronunciation: true,
  });
  // Never correct ASR speech-to-text mistakes ("TV stroke podcast", "a state" -> "an estate")
  const corrections = rawSanitizedCorrections.filter((item) => {
    const origLower = item.original.toLowerCase();
    if (/\bstroke\b/.test(origLower) && repairedSet.has('stroke')) return false;
    if (/\ba state\b/.test(origLower) && repairedSet.has('estate')) return false;
    const origWords = origLower.match(/[a-z0-9]+/g) ?? [];
    if (origWords.length > 0 && origWords.every((w) => repairedSet.has(w))) return false;
    return true;
  });
  const derivedPatterns = Array.from(new Set(corrections.map((c) => c.error_category)));
  const rawPatterns = Array.isArray(obj.errorPatterns)
    ? obj.errorPatterns
        .filter((item) => !pronunciationClaim.test(String(item)))
        .map(coerceErrorCategory)
        .filter((c, idx, arr) => arr.indexOf(c) === idx)
        .slice(0, 8)
    : [];

  const cleanedFeedback =
    typeof obj.feedback === 'string'
      ? splitSentences(obj.feedback)
          .filter((sentence) => !pronunciationClaim.test(sentence))
          .join(' ')
          .trim()
      : '';
  const feedback = cleanedFeedback
    ? simplifyToB1B2(cleanedFeedback, {
        weekNumber: options.weekNumber,
        maxSentenceWords: MAX_B1B2_SENTENCE_WORDS,
      })
    : 'You shared your main ideas clearly.';

  const rawImproved =
    typeof obj.improvedResponse === 'string' && obj.improvedResponse.trim()
      ? stripMeaninglessFiller(obj.improvedResponse.trim())
      : cleanedTranscript || 'No speech detected.';
  const withRepairsApplied = cleanTranscriptionArtifacts(rawImproved).cleanedTranscript;
  const simplifiedImproved = simplifyToB1B2(withRepairsApplied, {
    weekNumber: options.weekNumber,
    learnerText: cleanedTranscript,
    maxSentenceWords: MAX_B1B2_SENTENCE_WORDS,
  });
  const improvedResponse =
    stripMeaninglessFiller(clampLengthNearTranscript(simplifiedImproved, cleanedTranscript)) ||
    cleanedTranscript ||
    'No speech detected.';

  const highlights: ImprovedHighlight[] = validateImprovedHighlights(
    obj.highlights,
    improvedResponse,
    options.weekNumber ?? null,
    {
      learnerTranscript: cleanedTranscript,
      excludeWords: repairedWords,
      corrections,
    },
  );
  const improvementsList = cleanList(obj.improvements);
  const nextStep = oneB1Sentence(
    obj.nextStep ?? improvementsList[0] ?? areas.grammar_and_vocabulary.improvement,
    areas.grammar_and_vocabulary.improvement,
    { weekNumber: options.weekNumber, stripPronunciation: true },
  );
  const offTopic = Boolean(obj.offTopic);
  const showExampleFirst = isShortOrOffTopicTranscript(cleanedTranscript, offTopic);
  const examplePromptMessage = showExampleFirst ? SHORT_OR_OFF_TOPIC_MESSAGE : null;

  return SpeakingFeedbackSchema.parse({
    cleanedTranscript: cleanedTranscript || 'No speech detected.',
    repairedWords,
    nextStep,
    improvedResponse,
    highlights,
    showExampleFirst,
    examplePromptMessage,
    offTopic,
    feedback: feedback || 'You shared your main ideas clearly.',
    strengths: cleanList(obj.strengths),
    improvements: improvementsList,
    corrections,
    errorPatterns: corrections.length > 0 ? derivedPatterns : rawPatterns,
    tips: cleanList(obj.tips),
    areas,
  });
}

const SEVERITY_PRIORITY: Record<ErrorSeverity, number> = {
  major: 3,
  moderate: 2,
  minor: 1,
};

const DAILY_NEW_ERROR_CARD_CAP = 5;

function tokenJaccardSimilarity(a: string, b: string): number {
  const tokA = new Set(normalizeSentenceForCompare(a).split(' ').filter(Boolean));
  const tokB = new Set(normalizeSentenceForCompare(b).split(' ').filter(Boolean));
  if (tokA.size === 0 && tokB.size === 0) return 1;
  let inter = 0;
  for (const t of tokA) {
    if (tokB.has(t)) inter++;
  }
  const union = tokA.size + tokB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function findContainingSentence(sourceText: string | undefined, snippet: string): string | null {
  if (!sourceText || !snippet) return null;
  const sentences = sourceText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 260);
  const normSnippet = normalizeSentenceForCompare(snippet);
  if (!normSnippet) return null;
  for (const s of sentences) {
    if (normalizeSentenceForCompare(s).includes(normSnippet)) {
      return s;
    }
  }
  return null;
}

/**
 * Persist normalized learner errors and create quality-checked, deduplicated,
 * daily-capped spaced-repetition review cards (`error_review_cards`).
 */
export async function persistLearnerErrors(
  supabase: SupabaseClient,
  params: {
    userId: string;
    sourceType: 'writing' | 'speaking' | 'practice' | 'mediation';
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
    const simplifiedCardCorrected = simplifyToB1B2(rawCorrected, {
      learnerText: params.sourceText,
      maxSentenceWords: MAX_B1B2_SENTENCE_WORDS,
    });

    // Requirement 7a/7b: only create a Review card for a single-point grammar
    // or vocabulary fix (<= 4 changed words, original <= 25 words, not
    // coherence/organisation/style). Multi-point rewrites stay in feedback only.
    const filtered = evaluateAiCorrectionForCard({
      original: rawOriginal,
      corrected: simplifiedCardCorrected,
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
