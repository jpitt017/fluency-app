import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = 'speaking-recordings';
const BRITISH_VOICE_ID = 'sp7QaEHmiNEd5HgrXuOo';
const ELEVEN_MODEL_ID = 'eleven_multilingual_v2';
const NO_STORE = { 'cache-control': 'private, no-store' };

/**
 * Serves or generates-once British English TTS for a learner's saved
 * "Your answer, improved", cached per attempt/take in private Storage and
 * spending 0 AI usage units. Falls back cleanly (204) when server TTS is
 * not configured so the browser uses British Web Speech synthesis.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const admin = createAdminSupabase();
  if (!supabase || !admin) {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to play audio.' }, { status: 401, headers: NO_STORE });
  }

  const searchParams = (req.nextUrl ?? new URL(req.url)).searchParams;
  const kind = searchParams.get('kind');
  const id = searchParams.get('id') ?? '';
  if ((kind !== 'attempt' && kind !== 'take') || !UUID.test(id)) {
    return NextResponse.json({ error: 'Invalid audio request.' }, { status: 400, headers: NO_STORE });
  }

  const table = kind === 'attempt' ? 'speaking_attempts' : 'week_speaking_takes';
  const { data: row, error: readErr } = await admin
    .from(table)
    .select('id,user_id,feedback')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (readErr || !row) {
    return NextResponse.json({ error: 'Attempt not found.' }, { status: 404, headers: NO_STORE });
  }

  const feedback =
    row.feedback && typeof row.feedback === 'object'
      ? (row.feedback as Record<string, unknown>)
      : {};
  const improvedResponse =
    typeof feedback.improvedResponse === 'string' ? feedback.improvedResponse.trim() : '';
  if (!improvedResponse) {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }

  const expectedPath = `${user.id}/tts/${kind}/${id}.mp3`;
  const existingPath =
    typeof feedback.ttsAudioPath === 'string' && feedback.ttsAudioPath === expectedPath
      ? feedback.ttsAudioPath
      : null;

  if (existingPath) {
    const cached = await admin.storage.from(BUCKET).download(existingPath);
    if (!cached.error && cached.data) {
      return new NextResponse(await cached.data.arrayBuffer(), {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'cache-control': 'private, max-age=3600',
        },
      });
    }
  }

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenKey) {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }

  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${BRITISH_VOICE_ID}?output_format=mp3_22050_32`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: improvedResponse.slice(0, 1800),
          model_id: ELEVEN_MODEL_ID,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0,
            use_speaker_boost: true,
            speed: 0.85,
          },
        }),
      },
    );

    if (!ttsRes.ok) {
      return new NextResponse(null, { status: 204, headers: NO_STORE });
    }

    const mp3Bytes = await ttsRes.arrayBuffer();
    if (!mp3Bytes.byteLength) {
      return new NextResponse(null, { status: 204, headers: NO_STORE });
    }

    const uploaded = await admin.storage.from(BUCKET).upload(expectedPath, mp3Bytes, {
      contentType: 'audio/mpeg',
      upsert: true,
    });
    if (!uploaded.error) {
      await admin
        .from(table)
        .update({ feedback: { ...feedback, ttsAudioPath: expectedPath } })
        .eq('id', id)
        .eq('user_id', user.id);
    }

    return new NextResponse(mp3Bytes, {
      status: 200,
      headers: {
        'content-type': 'audio/mpeg',
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }
}
