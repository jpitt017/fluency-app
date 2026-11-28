import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { enforceAiUsage } from '@/lib/b1b2/ai-guard';
import { evaluateSpeakingTranscript } from '@/lib/b1b2/speaking-evaluation';
import {
  cueChecklistFromEvidence,
  detectUsedHighlights,
  fluencyFromWhisper,
  soundTips,
  structureUsed,
} from '@/lib/b1b2/speaking-feedback.mjs';
import { parseWeekSpeakingTakePath } from '@/lib/b1b2/week-speaking-recordings.mjs';
import { sanitizeLearnerText } from '@/lib/b1b2/prompt-guard';
import { providerFailureResponse } from '@/lib/b1b2/provider-failure-response';
import { logAiRequest } from '@/lib/b1b2/observability';
import { loadLearnerWeek } from '@/lib/curriculum/learner-week';
import { speakingSupportConfig } from '@/lib/curriculum/week-speaking-support';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENDPOINT = '/api/speaking/evaluate';
const NO_STORE = { 'cache-control': 'private, no-store' };

/** Atomically reserve one of the five checks, then charge the normal AI quota. */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const supabase = await createServerSupabase();
  const admin = createAdminSupabase();
  let userId = '';
  let checkId = '';
  let outcome: 'cancelled' | 'failed' | null = null;
  let statusCode = 200;
  let cacheHit = false;
  let seconds = 0;
  let inputChars = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let errorMessage: string | null = null;
  try {
    if (!supabase || !admin) {
      statusCode = 503;
      return NextResponse.json(
        { error: 'Checking is temporarily unavailable.' },
        { status: statusCode, headers: NO_STORE },
      );
    }
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      statusCode = 401;
      return NextResponse.json(
        { error: 'Sign in to check your recording.' },
        { status: statusCode, headers: NO_STORE },
      );
    }
    userId = user.id;
    const body = (await req.json().catch(() => ({}))) as { takeId?: unknown };
    const takeId = typeof body.takeId === 'string' ? body.takeId : '';
    if (!UUID.test(takeId)) {
      statusCode = 400;
      return NextResponse.json(
        { error: 'Recording not found.' },
        { status: statusCode, headers: NO_STORE },
      );
    }
    checkId = crypto.randomUUID();
    const reserved = await admin.rpc('reserve_week_speaking_check', {
      p_user_id: user.id,
      p_take_id: takeId,
      p_check_id: checkId,
    });
    if (reserved.error || !reserved.data) {
      checkId = '';
      statusCode = 409;
      return NextResponse.json(
        { error: 'This recording cannot be checked now. Refresh the page and check your remaining checks.' },
        { status: statusCode, headers: NO_STORE },
      );
    }
    // Until the normal quota is charged, any failure cancels the reservation.
    outcome = 'cancelled';
    const info = reserved.data as {
      path: string;
      kind: 'first' | 'retry' | 'structure';
      week: number;
      attemptId: string;
      sourceTakeId: string | null;
    };
    const parsed = parseWeekSpeakingTakePath(info.path);
    const config = speakingSupportConfig(info.week);
    const week = await loadLearnerWeek(info.week);
    if (
      !parsed ||
      parsed.userId !== user.id ||
      parsed.takeId !== takeId ||
      parsed.attemptId !== info.attemptId ||
      parsed.weekNumber !== info.week ||
      !config ||
      !week
    ) {
      throw new Error('Invalid weekly speaking reservation');
    }
    const { data: take, error: takeError } = await admin
      .from('week_speaking_takes')
      .select('selected_phrases')
      .eq('id', takeId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (takeError || !take) throw new Error('Weekly recording not found');

    let targetStructure = '';
    let sourceHighlights: Array<{ substring: string; label?: string }> = [];
    if (info.kind === 'structure') {
      const source = await admin
        .from('week_speaking_takes')
        .select('feedback')
        .eq('id', info.sourceTakeId)
        .eq('user_id', user.id)
        .maybeSingle();
      targetStructure =
        typeof source.data?.feedback?.structure?.structure === 'string'
          ? source.data.feedback.structure.structure
          : '';
      if (source.error || !targetStructure) throw new Error('The sentence structure is unavailable');
    } else if (info.kind === 'retry' && info.sourceTakeId && UUID.test(info.sourceTakeId)) {
      const source = await admin
        .from('week_speaking_takes')
        .select('feedback')
        .eq('id', info.sourceTakeId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (Array.isArray(source.data?.feedback?.highlights)) {
        sourceHighlights = (source.data.feedback.highlights as Array<{
          substring?: unknown;
          label?: unknown;
        }>)
          .filter((h) => typeof h?.substring === 'string' && h.substring.trim().length > 0)
          .map((h) => ({
            substring: String(h.substring).trim(),
            label: typeof h.label === 'string' ? h.label : String(h.substring).trim(),
          }));
      }
    }

    const downloaded = await admin.storage.from('speaking-recordings').download(info.path);
    if (downloaded.error || !downloaded.data) throw new Error('The saved recording is unavailable');
    if (!process.env.GROQ_API_KEY) {
      throw Object.assign(new Error('Speech service is not configured'), { status: 401 });
    }

    const guard = await enforceAiUsage(supabase, ENDPOINT, info.kind === 'structure' ? 2 : 6);
    if (!guard.allowed && guard.response) {
      statusCode = guard.response.status;
      return guard.response;
    }
    outcome = 'failed';
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const mime = parsed.extension === 'm4a' ? 'audio/mp4' : `audio/${parsed.extension}`;
    const audio = new File([downloaded.data], `recording.${parsed.extension}`, { type: mime });
    const transcription = await groq.audio.transcriptions.create({
      file: audio,
      model: 'whisper-large-v3-turbo',
      language: 'en',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });
    const transcript = sanitizeLearnerText(transcription.text, 4000).text;
    inputChars = transcript.length;
    const fluency = fluencyFromWhisper(transcript, transcription);
    seconds = fluency.seconds ?? 0;
    if (!transcript) {
      statusCode = 400;
      return NextResponse.json(
        {
          error:
            'We could not hear speech. You can check this saved recording again while checks remain.',
        },
        { status: statusCode, headers: { ...NO_STORE, ...guard.headers } },
      );
    }

    let feedback: Record<string, unknown>;
    if (info.kind === 'structure') {
      feedback = {
        transcript,
        structure: targetStructure,
        used: structureUsed(transcript, targetStructure),
      };
    } else {
      const phrases = Array.isArray(take.selected_phrases)
        ? take.selected_phrases.filter((item: unknown): item is string => typeof item === 'string')
        : [];
      const evaluation = await evaluateSpeakingTranscript({
        groq,
        supabase,
        transcript,
        prompt: week.speakingPrompt,
        targetPhrase: phrases.join(', '),
        weekNumber: info.week,
        cueLabels: config.planNotes,
        partLabel: 'Part 2: Long turn (60–90 seconds)',
      });
      cacheHit = evaluation.cacheHit;
      promptTokens = evaluation.promptTokens;
      completionTokens = evaluation.completionTokens;
      const cueChecklist =
        evaluation.cueChecklist ??
        cueChecklistFromEvidence(evaluation.cuePoints, transcript, config.planNotes);
      const highlightsToReport =
        sourceHighlights.length > 0
          ? sourceHighlights
          : phrases.map((p) => ({ substring: p, label: p }));
      const usedHighlights =
        info.kind === 'retry' && highlightsToReport.length > 0
          ? detectUsedHighlights(transcript, highlightsToReport)
          : [];
      feedback = {
        transcript,
        summary: evaluation.validated.feedback,
        feedback: evaluation.validated.feedback,
        areas: evaluation.validated.areas ?? null,
        improvedResponse: evaluation.validated.improvedResponse ?? null,
        highlights: evaluation.validated.highlights ?? [],
        ...(info.kind === 'retry' ? { usedHighlights } : {}),
        showExampleFirst: Boolean(evaluation.validated.showExampleFirst),
        examplePromptMessage: evaluation.validated.examplePromptMessage ?? null,
        corrections: evaluation.validated.corrections ?? [],
        structure: evaluation.structure,
        cuePoints: evaluation.cuePoints,
        cueChecklist,
        fluency,
        soundTips: soundTips(transcript),
      };
    }
    const saved = await admin.rpc('finish_week_speaking_check', {
      p_user_id: user.id,
      p_check_id: checkId,
      p_status: 'succeeded',
      p_transcript: transcript,
      p_feedback: feedback,
    });
    if (saved.error || saved.data !== true) {
      statusCode = 503;
      return NextResponse.json(
        { error: 'Your feedback may have been saved. Refresh the page to check.' },
        { status: statusCode, headers: { ...NO_STORE, ...guard.headers } },
      );
    }
    outcome = null;
    return NextResponse.json(
      { ...feedback, takeId, weekRecorded: info.kind === 'first' ? true : null },
      { headers: { ...NO_STORE, ...guard.headers } },
    );
  } catch (cause) {
    const failure = await providerFailureResponse({
      admin: supabase,
      endpoint: '/api/week/speaking/check',
      model: 'openai/gpt-oss-20b',
      error: cause,
      workSaved: true,
      workKind: 'recording',
    });
    statusCode = failure.status;
    errorMessage = failure.errorMessage;
    return failure.response;
  } finally {
    if (outcome && checkId && userId && admin) {
      const result = await admin.rpc('finish_week_speaking_check', {
        p_user_id: userId,
        p_check_id: checkId,
        p_status: outcome,
        p_transcript: null,
        p_feedback: null,
      });
      if (result.error || result.data !== true) {
        console.error('[week-speaking] check finalisation failed:', result.error);
      }
    }
    await logAiRequest(
      supabase,
      {
        endpoint: '/api/week/speaking/check',
        model: 'openai/gpt-oss-20b',
        statusCode,
        latencyMs: Date.now() - startedAt,
        cacheHit,
        audioSeconds: seconds,
        inputChars,
        promptTokens,
        completionTokens,
        errorMessage,
      },
      Boolean(userId),
    );
  }
}
