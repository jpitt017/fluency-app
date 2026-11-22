import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  const kind = request.nextUrl.searchParams.get('kind');
  if (!/^[0-9a-f-]{36}$/i.test(id) || (kind !== 'audio' && kind !== 'screenshot')) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { data } = await client.from('issue_reports').select('audio_path,screenshot_path').eq('id', id).maybeSingle();
  const path = kind === 'audio' ? data?.audio_path : data?.screenshot_path;
  if (!path) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { data: signed, error } = await client.storage.from('issue-attachments').createSignedUrl(path, 60);
  if (error || !signed) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.redirect(signed.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
}
