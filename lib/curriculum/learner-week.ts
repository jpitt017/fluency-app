import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import listeningSupport from '../../supabase-b1-b2/content/curriculum/listening-support-weeks-01-04.json';
import readingSupportContent from '../../supabase-b1-b2/content/curriculum/reading-support-weeks-01-04.json';
import vocabularyMeanings from './vocabulary-meanings.json';
import { projectSupport } from './listening-support.mjs';
import { projectReadingSupport } from './reading-support.mjs';
import { createServerSupabase } from '@/utils/supabase/server';
import { projectInputQuestions } from './input-marking.mjs';
import { getCachedSafeInputItems, getCachedSafeWeekDetails, projectSafeInputQuestion, projectSafeWeekDetails } from './syllabus-cache';

export type LearnerQuestion = { id: string; question: string; options: string[] };
type Input = { title: string; text?: string; audioUrl?: string; questions: LearnerQuestion[] };
/**
 * The learner-facing shape of one week's listening support.
 *
 * Declared here rather than inferred: the projection lives in an untyped .mjs
 * module (so the unit tests can import it without a build step), and inferring
 * across that boundary silently gives every field `any`.
 */
export type LearnerTranscriptSegment = { text: string; gloss?: string; card?: string };
export type LearnerListeningSupport = {
  intro: { title: string; context: string; predict: string; ideas: string[] };
  keyWords: { word: string; meaning: string; es: string; example: string; note: string | null }[];
  /** The transcript's 7 tap-to-see glosses; null until the transcript unlocks. */
  glosses: { tap: string; meaning: string; es: string }[] | null;
  cardWords: { word: string; meaning: string }[];
  /** Null until this learner has answered every listening question. */
  transcript: LearnerTranscriptSegment[] | null;
  /**
   * Null until the transcript is unlocked. The gloss check is part of "Go
   * further", which is practice on the transcript, so sending its questions
   * early would put the exercise in front of a learner who has not read a word
   * of the text it is about.
   */
  glossCheck: { id: string; stem: string; options: string[] }[] | null;
};
/**
 * The listening support for one week.
 *
 * `transcript` is null until this learner has answered every listening
 * question, and the check is made here, on the server, from the saved answers.
 * The page therefore cannot render the script before then even by accident: it
 * never receives it.
 */
export type LearnerListening = {
  support: LearnerListeningSupport | null;
  /** How many listening questions have a saved answer, and how many exist. */
  answered: number;
  total: number;
  transcriptUnlocked: boolean;
};
export type LearnerReadingSupport = {
  context: string;
  predict: string;
  keyWords: { word: string; meaning: string; es: string; example: string; note: string | null }[];
  glosses: { tap: string; meaning: string; es: string }[];
  cardWords: { word: string; meaning?: string }[];
  text: { text: string; gloss?: string; card?: string }[];
  glossCheck: { id: string; stem: string; options: string[] }[] | null;
};
export type LearnerReading = {
  support: LearnerReadingSupport | null;
  answered: number;
  total: number;
  questionsAnswered: boolean;
};
export type LearnerWeek = { canDo: string; title: string; speakingPrompt: string; speakingLength: string | null; cueCard: string; shadowingChunks: { text: string; note: string; audioUrl: string | null }[]; writingPrompt: string; reading: Input; listening: Input; readingSupport: LearnerReading; listeningSupport: LearnerListening };

/** Explicit allowlist: never serialize answer keys, models or listening transcripts. */
export async function loadLearnerWeek(number: number): Promise<LearnerWeek | null> {
  const bundledWeek = details.weeks.find((week) => week.number === number);
  const reading = details.reading.weeks.find((week) => week.week === number);
  const listening = details.listening.weeks.find((week) => week.week === number);
  if (!bundledWeek || !reading || !listening) return null;

  let week = bundledWeek;
  let dbQuestions: { mode: string; payload: unknown }[] = [];
  try {
    const client = await createServerSupabase();
    if (client) {
      const [cachedDetail, cachedQuestions] = await Promise.all([
        getCachedSafeWeekDetails(number),
        getCachedSafeInputItems(number),
      ]);
      let detail = cachedDetail;
      let questions = cachedQuestions;
      // Local environments without a service-role key still use the signed-in
      // safe views, but are deliberately uncached rather than caching a
      // request-scoped authenticated response across learners.
      if (detail === null || questions === null) {
        const [detailResult, questionsResult] = await Promise.all([
          detail === null
            ? client.from('syllabus_week_details_safe').select('payload').eq('week_number', number).maybeSingle()
            : Promise.resolve(null),
          questions === null
            ? client.from('syllabus_input_items_safe').select('mode,payload,sort_order').eq('week_number', number).order('sort_order')
            : Promise.resolve(null),
        ]);
        if (detail === null && !detailResult?.error && detailResult?.data?.payload) {
          detail = projectSafeWeekDetails(detailResult.data.payload);
        }
        if (questions === null && !questionsResult?.error && questionsResult?.data) {
          questions = questionsResult.data.flatMap((row) => {
            const projected = projectSafeInputQuestion(row.payload);
            return projected ? [{ mode: String(row.mode), payload: projected, sort_order: Number(row.sort_order) }] : [];
          });
        }
      }
      if (detail) {
        week = {
          ...bundledWeek,
          ...(detail.title ? { title: detail.title } : {}),
          ...(detail.canDo ? { canDo: detail.canDo } : {}),
          speaking: {
            ...bundledWeek.speaking,
            ...(detail.speaking?.prompt ? { prompt: detail.speaking.prompt } : {}),
            ...(detail.speaking?.cueCard ? { cueCard: detail.speaking.cueCard } : {}),
            ...(detail.speaking?.record ? {
              flow: { ...bundledWeek.speaking.flow, record: detail.speaking.record },
            } : {}),
            ...(detail.speaking?.shadowingChunks ? { shadowingChunks: detail.speaking.shadowingChunks } : {}),
          },
          ...(detail.writing?.prompt ? {
            writing: { ...bundledWeek.writing, prompt: detail.writing.prompt },
          } : {}),
        } as typeof bundledWeek;
      }
      if (questions) dbQuestions = questions;
    }
  } catch {
    // The explicitly projected bundled content is safe for signed-out/offline use.
  }
  const questionsFor = (mode: string, fallback: typeof reading.questions): LearnerQuestion[] => {
    const rows = dbQuestions.filter((row) => row.mode === mode).map((row) => row.payload as { id: string; question: string; options: string[] });
    // One projection for both sources: it keeps the question and choices and
    // drops key, reason and accepted answers, so neither path can leak one.
    return projectInputQuestions(rows.length ? rows : fallback) as LearnerQuestion[];
  };
  const readingQuestions = questionsFor('reading', reading.questions);
  const listeningQuestions = questionsFor('listening', listening.questions);
  const readingSupport = await loadReadingSupport(number, readingQuestions, reading.text, reading.predict);
  const listeningSupport = await loadListeningSupport(number, listeningQuestions, listening.script);

  return {
    title: week.title, canDo: week.canDo,
    shadowingChunks: (week.speaking.shadowingChunks ?? []).map((chunk: { chunk: string; listenFor: string; audioUrl?: string }) => ({ text: chunk.chunk, note: chunk.listenFor, audioUrl: chunk.audioUrl ?? null })),
    speakingPrompt: week.speaking.prompt, speakingLength: week.speaking.flow.record.match(/\b\d+[–-]\d+\s*s\b/)?.[0].replace(/\s*s$/, ' seconds') ?? null, cueCard: week.speaking.cueCard,
    writingPrompt: week.writing.prompt,
    reading: { title: reading.title, text: reading.text, questions: readingQuestions },
    listening: { title: listening.title, audioUrl: (listening as { audioUrl?: string }).audioUrl, questions: listeningQuestions },
    readingSupport,
    listeningSupport,
  };
}

/** Card meanings are the vocabulary step's own wording, so "tap for meaning" matches. */
function cardMeanings(weekNumber: number, words: string[]): Record<string, string> {
  const definitions = vocabularyMeanings.weeks.find((entry) => entry.week === weekNumber)?.definitions ?? [];
  const byTarget = new Map(definitions.map((entry) => [entry.target.toLowerCase(), entry.definition as string]));
  const found: Record<string, string> = {};
  for (const word of words) {
    const definition = byTarget.get(word.toLowerCase());
    if (definition) found[word] = definition;
  }
  return found;
}

/**
 * Build reading support and gate only card-word definitions and the optional
 * check on saved, server-checked answers to every reading question.
 */
async function loadReadingSupport(
  weekNumber: number,
  questions: LearnerQuestion[],
  text: string,
  predict: string,
): Promise<LearnerReading> {
  const authored = readingSupportContent.weeks.find((entry) => entry.week === weekNumber);
  const cardTerms = (authored?.cardWords ?? []).map((entry) => entry.card);
  let answeredIds = new Set<string>();
  try {
    const client = await createServerSupabase();
    const user = client ? (await client.auth.getUser()).data.user : null;
    if (client && user) {
      const saved = await client
        .from('week_input_answers')
        .select('item_id')
        .eq('user_id', user.id)
        .eq('week_number', weekNumber)
        .eq('skill', 'reading');
      if (!saved.error && saved.data) answeredIds = new Set(saved.data.map((row) => row.item_id as string));
    }
  } catch {
    // Signed out or a failed query: keep the meanings and optional check locked.
  }
  const answered = questions.filter((question) => answeredIds.has(question.id)).length;
  const questionsAnswered = questions.length > 0 && answered === questions.length;
  const support = projectReadingSupport(readingSupportContent, weekNumber, {
    text,
    predict,
    cardMeanings: cardMeanings(weekNumber, cardTerms),
    questionsAnswered,
  });
  return {
    support: support && {
      ...support,
      // Keep the answer key and feedback server-side. The check is not sent
      // before the saved-answer gate opens it.
      glossCheck: questionsAnswered ? support.glossCheck : null,
    },
    answered,
    total: questions.length,
    questionsAnswered,
  };
}

/**
 * Build the week's listening support, and decide whether this learner has
 * earned the transcript.
 *
 * The gate reads `week_input_answers`: one row per listening question, written
 * by the marking route as each answer is checked. Reading it server-side is the
 * point — a browser flag would be a suggestion, not a gate.
 */
async function loadListeningSupport(
  weekNumber: number,
  questions: LearnerQuestion[],
  script: string,
): Promise<LearnerListening> {
  const support = projectSupport(listeningSupport, weekNumber, {
    script,
    cardMeanings: cardMeanings(
      weekNumber,
      (listeningSupport.weeks.find((entry) => entry.week === weekNumber)?.cardWords ?? []) as string[],
    ),
  });

  let answeredIds = new Set<string>();
  try {
    const client = await createServerSupabase();
    const user = client ? (await client.auth.getUser()).data.user : null;
    if (client && user) {
      const saved = await client
        .from('week_input_answers')
        .select('item_id')
        .eq('user_id', user.id)
        .eq('week_number', weekNumber)
        .eq('skill', 'listening');
      if (!saved.error && saved.data) answeredIds = new Set(saved.data.map((row) => row.item_id as string));
    }
  } catch {
    // Signed out or offline: the transcript stays closed, as it should.
  }

  const answered = questions.filter((question) => answeredIds.has(question.id)).length;
  const transcriptUnlocked = support !== null && questions.length > 0 && answered === questions.length;

  return {
    // Nothing about the transcript, or the check that practices it, survives
    // when it is locked.
    support: support && {
      ...support,
      // The key words before the player stay: they are preparation. Everything
      // that only makes sense beside the transcript arrives with it.
      transcript: transcriptUnlocked ? support.transcript : null,
      glosses: transcriptUnlocked ? support.glosses : null,
      glossCheck: transcriptUnlocked ? support.glossCheck : null,
    },
    answered,
    total: questions.length,
    transcriptUnlocked,
  };
}
