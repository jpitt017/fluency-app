import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { readDeletionGeneration } from '@/lib/b1b2/deletion-generation.mjs';
import { currentLearnerWeek } from '@/lib/curriculum/current-week';
import { transcribeAudio } from '@/lib/b1b2/transcription';
import { logAiRequest } from '@/lib/b1b2/observability';
import { sendIssueAlert } from '@/lib/issues/email';

const BUCKET = 'issue-attachments';
const types = new Set(['broken', 'unclear', 'feedback', 'idea']);
const clip = (value: FormDataEntryValue | null, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

async function audioIsValid(file: File) {
  if (file.type !== 'audio/wav' || file.size < 46 || file.size > 1920044) return false;
  const data = Buffer.from(await file.arrayBuffer());
  return data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 16) === 'WAVEfmt ' &&
    data.readUInt32LE(16) === 16 && data.readUInt16LE(20) === 1 && data.readUInt16LE(22) === 1 &&
    data.readUInt32LE(24) === 16000 && data.readUInt16LE(34) === 16 && data.toString('ascii', 36, 40) === 'data' &&
    data.readUInt32LE(40) === data.length - 44 && data.length - 44 <= 60 * 16000 * 2;
}
async function imageIsValid(file: File) {
  if (file.size < 8 || file.size > 2_000_000) return false;
  const b = Buffer.from(await file.slice(0, 12).arrayBuffer());
  if (file.type === 'image/png') return b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (file.type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return file.type === 'image/webp' && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
}

export async function POST(request: NextRequest) {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Reports are not available right now.' }, { status: 503 });
  // Capture the upload generation before receiving/transcribing attachments.
  // 0081 rotates it when data deletion finishes, so an earlier request cannot
  // commit a late file or report after that point. On the 0080 schema the
  // legacy path remains available during the explicitly accepted overlap.
  let generation: string | null;
  try { generation = await readDeletionGeneration(admin, user.id, request.headers); }
  catch { return NextResponse.json({ error: 'Reports are not available right now.' }, { status: 503 }); }
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Please check your report.' }, { status: 400 });
  const type = clip(form.get('type'), 20);
  const mode = clip(form.get('mode'), 10);
  const audio = form.get('audio');
  const image = form.get('screenshot');
  const messageText = clip(form.get('message'), 4000);
  if (!types.has(type) || !['text', 'voice'].includes(mode) || (mode === 'text' && !messageText) || (mode === 'voice' && (!(audio instanceof File) || !(await audioIsValid(audio)))) || (image && (!(image instanceof File) || !(await imageIsValid(image))))) {
    return NextResponse.json({ error: 'Please check your message and files.' }, { status: 400 });
  }
  const limit = await client.rpc('reserve_issue_report');
  if (limit.error) return NextResponse.json({ error: 'Could not send your report. Please try again.' }, { status: 503 });
  if (!limit.data) return NextResponse.json({ error: 'Please wait before sending another report.' }, { status: 429 });
  let message = messageText;
  if (mode === 'voice' && audio instanceof File) {
    const start = Date.now();
    try {
      message = await transcribeAudio(audio);
      await logAiRequest(client, { endpoint: '/api/issues/transcribe', model: 'whisper-large-v3-turbo', statusCode: 200, latencyMs: Date.now() - start, audioSeconds: Math.ceil((audio.size - 44) / 32000) }, true);
    } catch {
      await logAiRequest(client, { endpoint: '/api/issues/transcribe', model: 'whisper-large-v3-turbo', statusCode: 500, latencyMs: Date.now() - start }, true);
      return NextResponse.json({ error: 'Could not hear your recording. Please try again.' }, { status: 503 });
    }
    if (!message) return NextResponse.json({ error: 'We could not hear any words. Please try again.' }, { status: 400 });
  }
  let pageUrl = '';
  try { const url = new URL(clip(form.get('page'), 2048)); if (url.protocol === 'https:' || url.protocol === 'http:') pageUrl = url.origin + url.pathname; } catch { /* empty */ }
  const include = form.get('includeLastAnswer') === 'true';
  let lastAnswer: string | null = null;
  if (include) {
    const [writing, speaking] = await Promise.all([
      client.from('writing_submissions').select('body,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      client.from('speaking_attempts').select('transcript,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (writing.error || speaking.error) return NextResponse.json({ error: 'Could not find your last answer. Please try again.' }, { status: 503 });
    const candidates = [{ text: writing.data?.body, date: writing.data?.created_at }, { text: speaking.data?.transcript, date: speaking.data?.created_at }].filter(x => x.text && x.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    lastAnswer = candidates[0]?.text?.slice(0, 10000) ?? null;
  }
  const id = randomUUID();
  const paths: string[] = [];
  async function upload(file: File, suffix: string) {
    const path = generation ? `${user!.id}/deletion-v1/${generation}/${id}-${suffix}` : `${user!.id}/${id}-${suffix}`;
    const { error } = await admin!.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    paths.push(path);
    return path;
  }
  try {
    const audioPath = mode === 'voice' && audio instanceof File ? await upload(audio, 'audio.wav') : null;
    const imagePath = image instanceof File ? await upload(image, 'screenshot') : null;
    const { error } = await admin.from('issue_reports').insert({ id, user_id: user.id, type, message, page_url: pageUrl, browser: clip(form.get('browser'), 512), device: clip(form.get('device'), 100), screen_size: clip(form.get('screen'), 40), current_week: await currentLearnerWeek(), app_version: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_VERSION || 'unknown').slice(0, 80), last_answer: lastAnswer, audio_path: audioPath, screenshot_path: imagePath, ...(generation ? { data_deletion_generation: generation } : {}) });
    if (error) throw error;
  } catch (error) {
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
    console.error('[issues] Could not save report:', error);
    return NextResponse.json({ error: 'Could not send. Please try again.' }, { status: 503 });
  }
  if (type === 'broken') await sendIssueAlert(admin, id);
  return NextResponse.json({ ok: true }, { status: 201 });
}
