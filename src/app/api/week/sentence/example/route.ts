import { NextResponse } from 'next/server';
import { sentenceSupport } from '@/lib/curriculum/week-sentence-support';

/** Teaching examples are revealed one at a time; marking criteria never leave the server. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const week = params.get('week');
  const id = params.get('id');
  const number = params.get('number');
  if (!week || !/^[1-4]$/.test(week) || !id || !/^[12]$/.test(number ?? '')) {
    return NextResponse.json({ error: 'This example is not available.' }, { status: 404 });
  }
  const support = sentenceSupport(Number(week), id);
  const example = support?.examples[Number(number) - 1];
  if (!example) return NextResponse.json({ error: 'This example is not available.' }, { status: 404 });
  return NextResponse.json({ example }, { headers: { 'Cache-Control': 'no-store' } });
}
