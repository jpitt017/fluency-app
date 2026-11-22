import 'server-only';
import details from '../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import { createServerSupabase } from '@/utils/supabase/server';

export type LearnerQuestion = { id: string; question: string; options: string[] };
type Input = { title: string; text?: string; audioUrl?: string; questions: LearnerQuestion[] };
export type LearnerWeek = { canDo: string; title: string; speakingPrompt: string; cueCard: string; writingPrompt: string; reading: Input; listening: Input };

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
    return (rows.length ? rows : fallback).map((q) => ({ id: q.id, question: q.question, options: Array.isArray(q.options) ? q.options : [] }));
  };
  return {
    title: week.title, canDo: week.canDo,
    speakingPrompt: week.speaking.prompt, cueCard: week.speaking.cueCard,
    writingPrompt: week.writing.prompt,
    reading: { title: reading.title, text: reading.text, questions: questionsFor('reading', reading.questions) },
    listening: { title: listening.title, audioUrl: (listening as { audioUrl?: string }).audioUrl, questions: questionsFor('listening', listening.questions) },
  };
}
