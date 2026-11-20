import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Custom AI lesson generation is disabled. Follow the fixed 16-week (112-session) B1 → B2 syllabus at /curriculum.',
    },
    { status: 410 },
  );
}
