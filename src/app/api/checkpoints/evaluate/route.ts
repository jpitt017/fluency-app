import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import Groq from 'groq-sdk';

async function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase public environment variables are not configured');
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { moduleNumber, objectiveId, transcript, durationSeconds = 120, targetStructures = [] } = body;
    if (!transcript || !moduleNumber || !objectiveId) {
      return NextResponse.json({ error: 'transcript, moduleNumber, and objectiveId are required' }, { status: 400 });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const words = transcript.trim().split(/\s+/).filter(Boolean);
    const wpm = durationSeconds > 0 ? Math.round((words.length / durationSeconds) * 60) : 0;
    const fillers = (transcript.match(/\b(er|um|uh|like|you know)\b/gi) ?? []).length;

    const prompt = `Evaluate this CEFR B1 checkpoint directly against the can-do rubric.\nModule: ${moduleNumber}\nTarget structures: ${targetStructures.join(', ') || 'Not specified'}\nTranscript: ${transcript}\nReturn strict JSON: {"taskAchievement":0-100,"grammarControl":0-100,"lexicalRange":0-100,"fluency":0-100,"targetStructureHitRate":0-100,"reviewDeck":["..."],"summary":"..."}`;
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'system', content: 'You are a CEFR B1 speaking assessor. Be rigorous, evidence-based, and return only JSON.' }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const evaluation = JSON.parse(completion.choices[0]?.message?.content || '{}');
    const scores = [evaluation.taskAchievement, evaluation.grammarControl, evaluation.lexicalRange, evaluation.fluency].map((value) => Number(value) || 0);
    const passed = scores.every((score) => score >= 60) && (Number(evaluation.targetStructureHitRate) || 0) >= 50;

    const rubric = { ...evaluation, wpm, fillerFrequency: words.length ? fillers / words.length : 0 };
    const { data, error } = await supabase
      .from('cefr_checkpoint_attempts')
      .insert({
        user_id: user.id,
        module_number: moduleNumber,
        objective_id: objectiveId,
        transcript,
        duration_seconds: durationSeconds,
        wpm,
        filler_frequency: words.length ? fillers / words.length : 0,
        target_structure_hit_rate: Number(evaluation.targetStructureHitRate) || 0,
        rubric,
        passed,
        review_deck: Array.isArray(evaluation.reviewDeck) ? evaluation.reviewDeck : [],
      })
      .select()
      .single();

    if (error) throw error;

    const mastery = passed ? 100 : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
    await supabase.from('cefr_objective_progress').upsert({
      user_id: user.id,
      objective_id: objectiveId,
      mastery,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,objective_id' });

    return NextResponse.json({ attempt: data, passed, mastery, rubric });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Checkpoint evaluation failed' }, { status: 500 });
  }
}
