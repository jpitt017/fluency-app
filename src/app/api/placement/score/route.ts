import { NextResponse } from 'next/server';
import { loadPlacementAnswerKey } from '@/lib/b1b2/data';

/** Scores the placement quiz on the server so answer indices never reach the browser. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { answers?: unknown };
  if (!Array.isArray(body?.answers) || !body.answers.every((answer) => Number.isInteger(answer) && answer >= 0)) {
    return NextResponse.json({ error: 'Provide a valid answers array.' }, { status: 400 });
  }

  const answerKey = await loadPlacementAnswerKey();
  if (!answerKey.length) {
    return NextResponse.json({ error: 'Placement questions are unavailable.' }, { status: 503 });
  }

  const answers = body.answers as number[];
  const score = answerKey.reduce(
    (total, correct, index) => total + (correct === answers[index] ? 1 : 0),
    0,
  );

  return NextResponse.json({ score, total: answerKey.length });
}
