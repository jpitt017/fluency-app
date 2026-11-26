import { NextResponse } from 'next/server';
import details from '@/supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import { markLearnerGrammarAnswer } from '@/lib/curriculum/learner-grammar-marking.mjs';
import { learnerGrammarReason } from '@/lib/curriculum/learner-grammar-reasons.mjs';
import { createServerSupabase } from '@/utils/supabase/server';
import { readStoredCurrentWeek } from '@/lib/curriculum/stored-current-week';
import { createAdminSupabase } from '@/utils/supabase/admin';

export async function POST(request: Request) {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: 'Sign in to check your answer.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { week?: unknown; id?: unknown; answer?: unknown } | null;
  const answer = body?.answer;
  const validAnswer = typeof answer === 'string' ? answer.length <= 500 : Array.isArray(answer) && answer.length > 0 && answer.length <= 5 && answer.every(part => typeof part === 'string' && part.length <= 500);
  if (!body || !Number.isInteger(body.week) || typeof body.id !== 'string' || !validAnswer) return NextResponse.json({ error: 'Please check your answer.' }, { status: 400 });
  const week = details.weeks.find(entry => entry.number === body.week);
  const item = week?.grammar.practice.items.find(entry => entry.id === body.id);
  if (!week || !item || item.step === 'Use it') return NextResponse.json({ error: 'This question is not available.' }, { status: 404 });
  const currentWeek = await readStoredCurrentWeek(client, user.id);
  if (currentWeek === null) return NextResponse.json({ error: 'Could not check your progress.' }, { status: 503 });
  if (week.number > currentWeek) return NextResponse.json({ error: 'This week is not open yet.' }, { status: 403 });
  let correct: boolean;
  try { correct = markLearnerGrammarAnswer(item, answer); }
  catch { return NextResponse.json({ error: 'Please check your answer.' }, { status: 400 }); }
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Could not save your answer.' }, { status: 503 });
  const { error } = await admin.from('week_grammar_attempts').insert({ user_id: user.id, week_number: week.number, item_id: item.id, answer, correct });
  if (error) return NextResponse.json({ error: 'Could not save your answer. Please try again.' }, { status: 503 });
  return NextResponse.json({ correct, reason: learnerGrammarReason(item) }, { headers: { 'Cache-Control': 'no-store' } });
}
