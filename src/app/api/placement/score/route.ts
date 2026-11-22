import { NextResponse } from 'next/server';
import { loadPlacementAnswerKey } from '@/lib/b1b2/data';
import { scorePlacement } from '@/lib/b1b2/placement-scoring.mjs';

/** Scores the placement quiz on the server so answer indices never reach the browser. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { answers?: unknown } | null;
  const answerKey = await loadPlacementAnswerKey();
  try {
    return NextResponse.json(scorePlacement(body?.answers, answerKey));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to score placement.';
    return NextResponse.json({ error: message }, { status: answerKey.length !== 24 ? 503 : 400 });
  }
}
