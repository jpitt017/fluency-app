import 'server-only';
import type Groq from 'groq-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildEvalCacheKey, readEvalCache, writeEvalCache } from './eval-cache';
import { buildSpeakingSystemPrompt, validateSpeakingFeedback } from './feedback-schema';
import { createGroqJsonCompletion } from './groq-json';
import { wrapLearnerSubmission } from './prompt-guard';
import { cuePointEvidence, structurePoint, weekStructure } from './speaking-feedback.mjs';

/** One text evaluation for both free practice and a saved weekly take. */
export async function evaluateSpeakingTranscript(params: {
  groq: Groq;
  supabase: SupabaseClient | null;
  transcript: string;
  prompt: string;
  targetPhrase: string;
  weekNumber?: number | null;
  cueLabels?: string[];
}) {
  const { groq, supabase, transcript, prompt, targetPhrase, weekNumber, cueLabels = [] } = params;
  const preferred = weekStructure(weekNumber);
  const cacheKey = buildEvalCacheKey({
    endpoint: '/api/speaking/evaluate',
    model: 'openai/gpt-oss-20b',
    // Change the key when this prompt/shape changes; old cache entries have no
    // sentence point or cue evidence. Audio timing is never cached here.
    prompt: `speaking-short-v2|${prompt}|${targetPhrase}|${preferred ?? ''}|${JSON.stringify(cueLabels)}`,
    input: transcript,
    variety: 'British',
  });
  let raw = await readEvalCache<Record<string, unknown>>(supabase, cacheKey);
  let cacheHit = Boolean(raw);
  let promptTokens = 0;
  let completionTokens = 0;
  let validated;
  if (raw) {
    try { validated = validateSpeakingFeedback(raw, transcript); }
    catch { raw = null; cacheHit = false; }
  }
  if (!raw || !validated) {
    const userPrompt = `Context/Prompt: ${prompt || 'General B1 → B2 speaking practice'}
Target Language: ${targetPhrase || 'None'}
Preferred structure this week: ${preferred || 'none; use one of the four connectors'}
Cue-card labels: ${cueLabels.length ? JSON.stringify(cueLabels) : 'none'}

${wrapLearnerSubmission(transcript)}`;
    const evaluation = await createGroqJsonCompletion(groq, {
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: buildSpeakingSystemPrompt() },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.25,
      maxCompletionTokens: 4096,
    });
    promptTokens = evaluation.promptTokens;
    completionTokens = evaluation.completionTokens;
    raw = evaluation.parsed && typeof evaluation.parsed === 'object' ? evaluation.parsed as Record<string, unknown> : {};
    validated = validateSpeakingFeedback(raw, transcript);
    // Keep only validated, transcript-grounded extras in the cache.
    await writeEvalCache(supabase, {
      cacheKey, endpoint: '/api/speaking/evaluate', model: 'openai/gpt-oss-20b',
      response: { ...validated, structure: structurePoint(raw.structure, transcript, weekNumber), cuePoints: cuePointEvidence(raw.cuePoints, transcript, cueLabels) },
    });
  }
  return {
    validated,
    structure: structurePoint(raw.structure, transcript, weekNumber),
    cuePoints: cuePointEvidence(raw.cuePoints, transcript, cueLabels),
    cacheHit, promptTokens, completionTokens,
  };
}
