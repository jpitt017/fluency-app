import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { logAiRequest } from '@/lib/b1b2/observability';
import {
  DAILY_TTS_LIMIT,
  ELEVEN_TTS_MODEL_ID,
  IMPROVED_TTS_ENDPOINT,
  madridDayStartIso,
  resolveApprovedBritishVoice,
} from '@/lib/b1b2/improved-tts-config.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = 'speaking-recordings';
const NO_STORE = { 'cache-control': 'private, no-store' };

/**
 * Serves or generates-once British English TTS for a learner's saved
 * "Your answer, improved", cached per attempt/take in private Storage and
 * spending 0 AI usage units.
 *
 * - Uses the approved British voice (`Host` = Jack Anthony, `sp7QaEHmiNEd5HgrXuOo`)
 *   by default, allowing only reviewed British/Irish overrides.
 * - Caps new ElevenLabs syntheses at 5 per learner per Europe/Madrid calendar day;
 *   cached replays do not count towards the 5-a-day synthesis limit.
 * - Falls back cleanly (204 / 429) so the browser plays British Web Speech (`en-GB`).
 */
export async function GET(req: NextRequest) {
  const startedAt = Date.now();
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
          'X-TTS-Cache': 'HIT',
          'X-TTS-Daily-Limit': String(DAILY_TTS_LIMIT),
        },
      });
    }
  }

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenKey) {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }

  const { count: usedToday, error: countErr } = await admin
    .from('ai_request_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('endpoint', IMPROVED_TTS_ENDPOINT)
    .eq('cache_hit', false)
    .eq('status_code', 200)
    .gte('created_at', madridDayStartIso());

  if (countErr || typeof usedToday !== 'number') {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }

  if (usedToday >= DAILY_TTS_LIMIT) {
    return NextResponse.json(
      {
        error:
          'You have used all 5 British voice plays for new answers today. Playing with a temporary computer voice instead.',
        dailyLimit: DAILY_TTS_LIMIT,
        remainingToday: 0,
      },
      {
        status: 429,
        headers: {
          ...NO_STORE,
          'X-TTS-Daily-Limit': String(DAILY_TTS_LIMIT),
          'X-TTS-Remaining-Day': '0',
        },
      },
    );
  }

  const approvedVoice = resolveApprovedBritishVoice(process.env.ELEVENLABS_VOICE_ID);

  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${approvedVoice.voiceId}?output_format=mp3_22050_32`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: improvedResponse.slice(0, 1800),
          model_id: ELEVEN_TTS_MODEL_ID,
          voice_settings: approvedVoice.voiceSettings,
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

    await logAiRequest(supabase, {
      endpoint: IMPROVED_TTS_ENDPOINT,
      model: ELEVEN_TTS_MODEL_ID,
      statusCode: 200,
      latencyMs: Date.now() - startedAt,
      cacheHit: false,
      inputChars: improvedResponse.length,
    }, true);

    const remainingToday = Math.max(0, DAILY_TTS_LIMIT - usedToday - 1);
    return new NextResponse(mp3Bytes, {
      status: 200,
      headers: {
        'content-type': 'audio/mpeg',
        'cache-control': 'private, max-age=3600',
        'X-TTS-Cache': 'MISS',
        'X-TTS-Daily-Limit': String(DAILY_TTS_LIMIT),
        'X-TTS-Remaining-Day': String(remainingToday),
      },
    });
  } catch {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }
}
