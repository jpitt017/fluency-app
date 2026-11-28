import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { validSupportNotes } from '@/lib/curriculum/speaking-support.mjs';
import { speakingSupportConfig } from '@/lib/curriculum/week-speaking-support';
import { parseWeekSpeakingTakePath } from '@/lib/b1b2/week-speaking-recordings.mjs';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { 'cache-control': 'private, no-store' };

/** Save a version without running AI. The database reserves its immutable key first. */
export async function POST(req: NextRequest) {
  let reservation: { takeId: string; path: string } | null = null;
  let userId = '';
  let uploadAttempted = false;
  let finalisationStarted = false;
  const supabase = await createServerSupabase();
  const admin = createAdminSupabase();
  try {
    if (!supabase || !admin) {
      return NextResponse.json(
        { error: 'Saving is temporarily unavailable.' },
        { status: 503, headers: NO_STORE },
      );
    }
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Sign in to save your recording.' },
        { status: 401, headers: NO_STORE },
      );
    }
    userId = user.id;
    const form = await req.formData();
    const audio = form.get('audio') as File | null;
    const week = Number(form.get('weekNumber'));
    const kind = String(form.get('kind') || '');
    const sourceTakeId = String(form.get('sourceTakeId') || '');
    const config = Number.isInteger(week) ? speakingSupportConfig(week) : null;
    if (
      !config ||
      !['first', 'retry', 'structure'].includes(kind) ||
      (kind === 'structure' && !UUID.test(sourceTakeId))
    ) {
      return NextResponse.json(
        { error: 'This recording is not available.' },
        { status: 400, headers: NO_STORE },
      );
    }
    if (!audio || typeof audio.size !== 'number' || audio.size < 1 || audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: 'Choose a recording under 10 MB.' },
        { status: 400, headers: NO_STORE },
      );
    }
    const mime = String(audio.type || '').toLowerCase().split(';')[0];
    const extension =
      mime === 'audio/mp4' || mime === 'audio/x-m4a'
        ? 'm4a'
        : mime === 'audio/ogg'
          ? 'ogg'
          : mime === 'audio/webm'
            ? 'webm'
            : null;
    if (!extension) {
      return NextResponse.json(
        { error: 'This audio format is not supported.' },
        { status: 400, headers: NO_STORE },
      );
    }
    let parsedNotes: unknown = [];
    let parsedPhrases: unknown = [];
    try {
      parsedNotes = JSON.parse(String(form.get('notes') || '[]'));
    } catch {
      /* rejected below */
    }
    try {
      parsedPhrases = JSON.parse(String(form.get('phrases') || '[]'));
    } catch {
      /* rejected below */
    }
    const notes = kind === 'first' ? validSupportNotes(parsedNotes, config.planNotes) : [];
    if (
      !notes ||
      !Array.isArray(parsedPhrases) ||
      parsedPhrases.length > 2 ||
      parsedPhrases.some((phrase) => typeof phrase !== 'string' || !phrase.trim()) ||
      new Set(parsedPhrases).size !== parsedPhrases.length ||
      (kind !== 'retry' && parsedPhrases.length > 0)
    ) {
      return NextResponse.json(
        { error: 'Please check your notes and selected phrases.' },
        { status: 400, headers: NO_STORE },
      );
    }

    const allowedPhrases = new Set<string>(config.noticePhrases);
    if (
      kind === 'retry' &&
      parsedPhrases.length > 0 &&
      parsedPhrases.some((phrase) => !allowedPhrases.has(phrase as string))
    ) {
      if (!UUID.test(sourceTakeId)) {
        return NextResponse.json(
          { error: 'Please check your notes and selected phrases.' },
          { status: 400, headers: NO_STORE },
        );
      }
      const source = await admin
        .from('week_speaking_takes')
        .select('feedback')
        .eq('id', sourceTakeId)
        .eq('user_id', user.id)
        .maybeSingle();
      const rawHighlights = Array.isArray(source.data?.feedback?.highlights)
        ? (source.data.feedback.highlights as Array<{ substring?: unknown }>)
        : [];
      for (const h of rawHighlights) {
        if (typeof h?.substring === 'string' && h.substring.trim()) {
          allowedPhrases.add(h.substring.trim());
        }
      }
      if (parsedPhrases.some((phrase) => !allowedPhrases.has(phrase as string))) {
        return NextResponse.json(
          { error: 'Please check your notes and selected phrases.' },
          { status: 400, headers: NO_STORE },
        );
      }
    }

    const takeId = crypto.randomUUID();
    const { data, error: reserveError } = await admin.rpc('reserve_week_speaking_take', {
      p_user_id: user.id,
      p_week_number: week,
      p_take_id: takeId,
      p_kind: kind,
      p_extension: extension,
      p_notes: notes,
      p_phrases: parsedPhrases,
      p_source_take_id:
        kind === 'structure' || (kind === 'retry' && UUID.test(sourceTakeId))
          ? sourceTakeId
          : null,
    });
    if (reserveError || !data || typeof data.path !== 'string') {
      return NextResponse.json(
        { error: 'This recording cannot be saved now. Refresh the page and check your remaining tries.' },
        { status: 409, headers: NO_STORE },
      );
    }
    reservation = { takeId, path: data.path };
    const parsed = parseWeekSpeakingTakePath(data.path);
    if (
      !parsed ||
      parsed.userId !== user.id ||
      parsed.weekNumber !== week ||
      parsed.takeId !== takeId ||
      parsed.attemptId !== data.attemptId
    ) {
      throw new Error('Invalid reserved recording key');
    }
    const contentType = extension === 'm4a' ? 'audio/mp4' : `audio/${extension}`;
    uploadAttempted = true;
    const uploaded = await admin.storage
      .from('speaking-recordings')
      .upload(data.path, audio, { contentType, upsert: false });
    if (uploaded.error) {
      console.error('[week-speaking] upload failed:', uploaded.error);
      return NextResponse.json(
        { error: 'We could not save this recording. Please try again.' },
        { status: 503, headers: NO_STORE },
      );
    }
    finalisationStarted = true;
    const result = await admin.rpc('finish_week_speaking_upload', {
      p_user_id: user.id,
      p_take_id: takeId,
      p_success: true,
    });
    if (result.error || result.data !== true) {
      if (!result.error && result.data === false) {
        const cleanup = await admin.storage.from('speaking-recordings').remove([data.path]);
        if (cleanup.error) {
          console.error('[week-speaking] late upload cleanup failed:', cleanup.error);
        }
      }
      console.error('[week-speaking] upload finalisation failed:', result.error);
      return NextResponse.json(
        { error: 'Your recording may have been saved. Refresh the page to check.' },
        { status: 503, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { takeId, sequence: Number(data.sequence), href: `/api/week/speaking/take/${takeId}` },
      { headers: NO_STORE },
    );
  } catch (cause) {
    console.error('[week-speaking] capture failed:', cause);
    return NextResponse.json(
      {
        error: finalisationStarted
          ? 'Your recording may have been saved. Refresh the page to check.'
          : 'We could not save this recording. Please try again.',
      },
      { status: 503, headers: NO_STORE },
    );
  } finally {
    if (reservation && !finalisationStarted && admin && userId) {
      try {
        const closed = await admin.rpc('finish_week_speaking_upload', {
          p_user_id: userId,
          p_take_id: reservation.takeId,
          p_success: false,
        });
        if (closed.error || closed.data !== true) {
          console.error('[week-speaking] upload reservation could not be closed:', closed.error);
        }
        const parsed = parseWeekSpeakingTakePath(reservation.path);
        if (
          closed.data === true &&
          !closed.error &&
          uploadAttempted &&
          parsed?.userId === userId &&
          parsed.takeId === reservation.takeId
        ) {
          const cleanup = await admin.storage
            .from('speaking-recordings')
            .remove([reservation.path]);
          if (cleanup.error) {
            console.error('[week-speaking] failed-upload cleanup failed:', cleanup.error);
          }
        }
      } catch (error) {
        console.error('[week-speaking] upload recovery failed:', error);
      }
    }
  }
}
