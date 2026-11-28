import { NextResponse } from 'next/server';
import details from '@/supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import reasons from '@/lib/curriculum/input-reasons.json';
import { markInputAnswer } from '@/lib/curriculum/input-marking.mjs';
import { createServerSupabase } from '@/utils/supabase/server';
import { readStoredCurrentWeek } from '@/lib/curriculum/stored-current-week';
import { createAdminSupabase } from '@/utils/supabase/admin';

type Skill = 'reading' | 'listening';
type Item = { id: string; step: string; question: string; options: string[]; key: string; reason?: string };

/**
 * Mark one reading or listening answer.
 *
 * The item bank stays here: the response says whether the answer is right, the
 * reason for the correct answer, and where in the text it comes from. It never
 * returns the key of a question the learner did not answer, so a single request
 * cannot harvest the set.
 */
export async function POST(request: Request) {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: 'Sign in to check your answers.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { week?: unknown; skill?: unknown; id?: unknown; answer?: unknown } | null;
  if (
    !body ||
    !Number.isInteger(body.week) ||
    (body.skill !== 'reading' && body.skill !== 'listening') ||
    typeof body.id !== 'string' ||
    typeof body.answer !== 'string'
  ) {
    return NextResponse.json({ error: 'Please check your answer.' }, { status: 400 });
  }

  const skill = body.skill as Skill;
  const weekNumber = body.week as number;
  const weekQuestions = details[skill].weeks.find((week) => week.week === weekNumber)?.questions as Item[] | undefined;
  const item = weekQuestions?.find((entry) => entry.id === body.id);
  if (!weekQuestions || !item) return NextResponse.json({ error: 'This question is not available.' }, { status: 404 });

  // A question only opens with its week.
  const currentWeek = await readStoredCurrentWeek(client, user.id);
  if (currentWeek === null) return NextResponse.json({ error: 'Could not check your progress.' }, { status: 503 });
  if (weekNumber > currentWeek) return NextResponse.json({ error: 'This week is not open yet.' }, { status: 403 });

  let marked: { correct: boolean; nearly?: boolean; reason: string | null };
  try {
    marked = markInputAnswer(item, body.answer);
  } catch {
    return NextResponse.json({ error: 'Please check your answer.' }, { status: 400 });
  }

  // The authored reason lives in the item; input-reasons.json holds the teacher
  // review copy (key, reason, source line) for items whose reason is still a
  // draft. Prefer the authored reason, fall back to the reviewed one.
  const reviewed = (reasons.items as { week: number; skill: Skill; id: string; reason?: string; sourceLine?: string }[])
    .find((entry) => entry.week === weekNumber && entry.skill === skill && entry.id === item.id);
  const reason = marked.reason ?? reviewed?.reason ?? null;
  const sourceLine = (reviewed?.sourceLine as string | undefined) ?? null;

  // The mark counts only once its answer has been saved: later steps and the
  // transcript gate rely on these same rows, not on a browser-only result.
  try {
    const admin = createAdminSupabase();
    if (!admin) {
      console.error('[input] Could not save attempt: admin client is not configured');
      return NextResponse.json({ error: 'We could not save your answer. Please try again.' }, { status: 503 });
    }
    const { error } = await admin.from('week_input_answers').upsert(
      { user_id: user.id, week_number: weekNumber, skill, item_id: item.id, answer: body.answer, correct: marked.correct },
      { onConflict: 'user_id,week_number,skill,item_id' },
    );
    if (error) {
      console.error('[input] Failed to save attempt:', error);
      return NextResponse.json({ error: 'We could not save your answer. Please try again.' }, { status: 503 });
    }

    // Complete the task as soon as the final checked answer is persisted. This
    // avoids leaving all ten listening answers saved but no task completion if
    // the learner misses (or the browser loses) the separate Finish request.
    const completionFailure = 'Your answer was saved, but task completion could not be saved. Check this answer again to retry.';
    try {
      const { data: savedAnswers, error: readError } = await admin.from('week_input_answers')
        .select('item_id').eq('user_id', user.id).eq('week_number', weekNumber).eq('skill', skill);
      if (readError) {
        console.error('[input] Could not verify saved answers for completion:', readError);
        return NextResponse.json({ error: completionFailure }, { status: 503 });
      }
      const savedIds = new Set((savedAnswers ?? []).map((row: { item_id: string }) => row.item_id));
      if (weekQuestions.every((question) => savedIds.has(question.id))) {
        const { error: completionError } = await admin.from('week_input_submissions').upsert(
          { user_id: user.id, week_number: weekNumber, skill },
          { onConflict: 'user_id,week_number,skill', ignoreDuplicates: true },
        );
        if (completionError) {
          console.error('[input] Could not save task completion:', completionError);
          return NextResponse.json({ error: completionFailure }, { status: 503 });
        }
      }
    } catch (error) {
      console.error('[input] Could not save task completion:', error);
      return NextResponse.json({ error: completionFailure }, { status: 503 });
    }
  } catch (error) {
    console.error('[input] Failed to save attempt:', error);
    return NextResponse.json({ error: 'We could not save your answer. Please try again.' }, { status: 503 });
  }

  return NextResponse.json(
    { correct: marked.correct, nearly: Boolean(marked.nearly), reason, sourceLine },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
