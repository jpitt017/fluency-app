import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import listeningSupport from '../../supabase-b1-b2/content/curriculum/listening-support-weeks-01-04.json';
import vocabularyMeanings from './vocabulary-meanings.json';
import { projectSupport } from './listening-support.mjs';
import { createServerSupabase } from '@/utils/supabase/server';
import { projectInputQuestions } from './input-marking.mjs';

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
export type LearnerWeek = { canDo: string; title: string; speakingPrompt: string; speakingLength: string | null; cueCard: string; shadowingChunks: { text: string; note: string; audioUrl: string | null }[]; writingPrompt: string; reading: Input; listening: Input; listeningSupport: LearnerListening };

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
      const [detail, questions] = await Promise.all([
        client.from('syllabus_week_details_safe').select('payload').eq('week_number', number).maybeSingle(),
        client.from('syllabus_input_items_safe').select('mode,payload').eq('week_number', number).order('sort_order'),
      ]);
      if (!detail.error && detail.data?.payload) week = detail.data.payload as typeof bundledWeek;
      if (!questions.error && questions.data) dbQuestions = questions.data;
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
  const listeningQuestions = questionsFor('listening', listening.questions);
  const listeningSupport = await loadListeningSupport(number, listeningQuestions, listening.script);

  return {
    title: week.title, canDo: week.canDo,
    shadowingChunks: (week.speaking.shadowingChunks ?? []).map((chunk: { chunk: string; listenFor: string; audioUrl?: string }) => ({ text: chunk.chunk, note: chunk.listenFor, audioUrl: chunk.audioUrl ?? null })),
    speakingPrompt: week.speaking.prompt, speakingLength: week.speaking.flow.record.match(/\b\d+[–-]\d+\s*s\b/)?.[0].replace(/\s*s$/, ' seconds') ?? null, cueCard: week.speaking.cueCard,
    writingPrompt: week.writing.prompt,
    reading: { title: reading.title, text: reading.text, questions: questionsFor('reading', reading.questions) },
    listening: { title: listening.title, audioUrl: (listening as { audioUrl?: string }).audioUrl, questions: listeningQuestions },
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
