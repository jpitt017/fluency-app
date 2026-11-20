import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { createServerSupabase } from '@/utils/supabase/server';

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return new Groq({ apiKey });
}

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function clampFive(val: unknown, fallback = 3.5): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Number(Math.max(0, Math.min(5, num)).toFixed(1));
}

export async function POST(req: NextRequest) {
  let groq: Groq;

  try {
    groq = getGroqClient();
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Groq API is not configured on the server' },
      { status: 503 },
    );
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let transcript = '';
    let targetPhrase = '';
    let promptContext = '';
    let taskId = '';
    let lessonId = '';
    let audioPath = '';
    let mimeType = '';
    let durationSeconds = 0;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const audioFile = formData.get('audio') as File | null;
      targetPhrase = String(formData.get('targetPhrase') || '');
      promptContext = String(formData.get('prompt') || '');
      taskId = String(formData.get('taskId') || '').trim();
      lessonId = String(formData.get('lessonId') || '').trim();
      audioPath = String(formData.get('audioPath') || '').trim();
      mimeType = String(formData.get('mimeType') || audioFile?.type || '').trim();
      durationSeconds = Number(formData.get('durationSeconds')) || 0;

      if (!audioFile) {
        return NextResponse.json({ error: 'No audio file provided.' }, { status: 400 });
      }

      if (audioFile.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: 'Audio file exceeds the 10 MB limit.' }, { status: 413 });
      }

      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-large-v3-turbo',
        language: 'en',
        response_format: 'json',
      });

      transcript = (transcription.text || '').trim();
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      transcript = String(body.transcript || '').trim();
      targetPhrase = String(body.targetPhrase || '');
      promptContext = String(body.prompt || '');
      taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
      lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : '';
      audioPath = typeof body.audioPath === 'string' ? body.audioPath.trim() : '';
      mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : '';
      durationSeconds = Number(body.durationSeconds) || 0;
    }

    if (!transcript) {
      return NextResponse.json(
        { error: 'Could not detect any speech in the recording. Please try speaking closer to the microphone.' },
        { status: 400 },
      );
    }

    const systemPrompt = `You are a CEFR B1 → B2 English speaking examiner.
Evaluate the student's spoken transcript on the 5-criterion B1 → B2 speaking rubric (each 0 to 5, allowing .5 increments).
Return strictly valid JSON with no markdown fences:
{
  "transcript": "string",
  "improvedResponse": "string (natural B2-ready version preserving the speaker's ideas)",
  "feedback": "string (2-3 encouraging, specific sentences)",
  "strengths": ["string (1-2 concrete strengths)"],
  "improvements": ["string (1-2 specific phrasing or grammar upgrades with one alternative phrasing each)"],
  "tips": ["string"],
  "rubric": {
    "fluency": 3.8,
    "lexical_range": 3.7,
    "grammar_accuracy": 3.6,
    "coherence": 4.0,
    "pronunciation": 3.8
  },
  "score": 78
}`;

    const userPrompt = `Context/Prompt: ${promptContext || 'General B1 → B2 speaking practice'}
Target Language: ${targetPhrase || 'None'}
Transcribed Speech: "${transcript}"`;

    const evaluation = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 900,
      response_format: { type: 'json_object' },
    });

    const rawEval = evaluation.choices[0]?.message?.content;
    const parsed = rawEval ? (JSON.parse(rawEval) as Record<string, unknown>) : {};
    const rawRubric = (parsed.rubric && typeof parsed.rubric === 'object'
      ? parsed.rubric
      : {}) as Record<string, unknown>;

    const rubric = {
      fluency: clampFive(rawRubric.fluency, 3.8),
      lexical_range: clampFive(rawRubric.lexical_range, 3.6),
      grammar_accuracy: clampFive(rawRubric.grammar_accuracy, 3.6),
      coherence: clampFive(rawRubric.coherence, 3.8),
      pronunciation: clampFive(rawRubric.pronunciation, 3.8),
    };

    const avgFive =
      (rubric.fluency +
        rubric.lexical_range +
        rubric.grammar_accuracy +
        rubric.coherence +
        rubric.pronunciation) /
      5;
    const score =
      typeof parsed.score === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed.score)))
        : Math.round((avgFive / 5) * 100);

    const improvedResponse =
      typeof parsed.improvedResponse === 'string' ? parsed.improvedResponse : transcript;
    const feedback =
      typeof parsed.feedback === 'string'
        ? parsed.feedback
        : 'Clear speech detected! Keep linking ideas with natural B2 transitions.';
    const strengths = Array.isArray(parsed.strengths)
      ? parsed.strengths.filter((s): s is string => typeof s === 'string').slice(0, 4)
      : [];
    const improvements = Array.isArray(parsed.improvements)
      ? parsed.improvements.filter((s): s is string => typeof s === 'string').slice(0, 4)
      : [];
    const tips = Array.isArray(parsed.tips)
      ? parsed.tips.filter((s): s is string => typeof s === 'string').slice(0, 4)
      : improvements;

    let savedAttemptId: string | null = null;
    let newBadges: string[] = [];

    if (taskId) {
      const supabase = await createServerSupabase();
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const wordCount = transcript.split(/\s+/).filter(Boolean).length;
          const { data: inserted, error: insertError } = await supabase
            .from('speaking_attempts')
            .insert({
              user_id: user.id,
              task_id: taskId,
              lesson_id: lessonId || null,
              audio_path: audioPath || null,
              mime_type: mimeType || null,
              duration_seconds: durationSeconds || null,
              transcript,
              word_count: wordCount,
              fluency: rubric.fluency,
              lexical_range: rubric.lexical_range,
              grammar_accuracy: rubric.grammar_accuracy,
              coherence: rubric.coherence,
              pronunciation: rubric.pronunciation,
              overall: score,
              feedback: {
                summary: feedback,
                improvedResponse,
                tips,
                rubric,
              },
              strengths,
              improvements,
              status: 'evaluated',
              ai_model: 'openai/gpt-oss-20b',
              evaluated_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (!insertError && inserted) {
            savedAttemptId = inserted.id;
            const { data: badgeCodes } = await supabase.rpc('evaluate_badges');
            if (Array.isArray(badgeCodes)) {
              newBadges = badgeCodes.filter((c): c is string => typeof c === 'string');
            }
          }
        }
      }
    }

    return NextResponse.json({
      attemptId: savedAttemptId,
      transcript,
      improvedResponse,
      feedback,
      strengths,
      improvements,
      tips,
      rubric,
      score,
      newBadges,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to evaluate speaking submission' },
      { status: 500 },
    );
  }
}
