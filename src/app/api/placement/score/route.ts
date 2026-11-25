import { NextResponse } from 'next/server';
import { loadPlacementAnswerKey } from '@/lib/b1b2/data';
import { scorePlacement } from '@/lib/b1b2/placement-scoring.mjs';

/** Scores the placement quiz on the server so answer indices never reach the browser. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { answers?: unknown } | null;
  let answerKey: number[] | null = null;
  try {
    answerKey = await loadPlacementAnswerKey();
    return NextResponse.json(scorePlacement(body?.answers, answerKey));
  } catch (error) {
    console.error('[placement] Could not score answers:', error);
    return NextResponse.json(
      { error: 'We could not check your answers. Please try again.' },
      { status: answerKey?.length === 24 ? 400 : 503 },
    );
  }
}
