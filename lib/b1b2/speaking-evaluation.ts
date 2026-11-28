import 'server-only';
import type Groq from 'groq-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildEvalCacheKey, readEvalCache, writeEvalCache } from './eval-cache';
import { buildSpeakingSystemPrompt, validateSpeakingFeedback } from './feedback-schema';
import { createGroqJsonCompletion } from './groq-json';
import { wrapLearnerSubmission } from './prompt-guard';
import {
  cueChecklistFromEvidence,
  cuePointEvidence,
  structurePoint,
  weekStructure,
} from './speaking-feedback.mjs';

/** One text evaluation for free practice, optional weekly parts, and a saved weekly take. */
export async function evaluateSpeakingTranscript(params: {
  groq: Groq;
  supabase: SupabaseClient | null;
  transcript: string;
  prompt: string;
  targetPhrase: string;
  weekNumber?: number | null;
  cueLabels?: string[];
  includeInteractive?: boolean;
  partLabel?: string;
  optionsList?: string[];
  decisionTask?: string;
}) {
  const {
    groq,
    supabase,
    transcript,
    prompt,
    targetPhrase,
    weekNumber,
    cueLabels = [],
    includeInteractive = false,
    partLabel,
    optionsList,
    decisionTask,
  } = params;
  const preferred = weekStructure(weekNumber);
  const cacheKey = buildEvalCacheKey({
    endpoint: '/api/speaking/evaluate',
    model: 'openai/gpt-oss-20b',
    prompt: `speaking-cambridge-v4|${prompt}|${targetPhrase}|w:${weekNumber ?? ''}|int:${includeInteractive ? '1' : '0'}|${partLabel ?? ''}|${preferred ?? ''}|${JSON.stringify(cueLabels)}`,
    input: transcript,
    variety: 'British',
  });
  let raw = await readEvalCache<Record<string, unknown>>(supabase, cacheKey);
  let cacheHit = Boolean(raw);
  let promptTokens = 0;
  let completionTokens = 0;
  let validated;
  if (raw) {
    try {
      validated = validateSpeakingFeedback(raw, transcript, { weekNumber, includeInteractive });
    } catch {
      raw = null;
      cacheHit = false;
    }
  }
  if (!raw || !validated) {
    const extraJsonFields = [
      `Also include "structure": { "original": "exact full sentence from transcript", "upgraded": "one B1–B2 sentence (<= 20 words) using ${preferred || 'although, which, so that, or because of'}", "explanation": "one short B1 sentence", "structure": "${preferred || 'which'}" }.`,
      cueLabels.length
        ? `Also include "cuePoints": [{ "label": one of ${JSON.stringify(cueLabels)}, "quote": "exact words from the transcript" }] for each cue point actually covered.`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const userPrompt = `Context/Prompt: ${prompt || 'General B1 → B2 speaking practice'}
Target Language: ${targetPhrase || 'None'}
Preferred structure this week: ${preferred || 'none; use one of the four connectors'}
Cue-card labels: ${cueLabels.length ? JSON.stringify(cueLabels) : 'none'}
${extraJsonFields}

${wrapLearnerSubmission(transcript)}`;
    const evaluation = await createGroqJsonCompletion(groq, {
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: buildSpeakingSystemPrompt(prompt, 'British', {
            weekNumber,
            includeInteractive,
            partLabel,
            optionsList,
            decisionTask,
          }),
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.25,
      maxCompletionTokens: 4096,
    });
    promptTokens = evaluation.promptTokens;
    completionTokens = evaluation.completionTokens;
    raw =
      evaluation.parsed && typeof evaluation.parsed === 'object'
        ? (evaluation.parsed as Record<string, unknown>)
        : {};
    validated = validateSpeakingFeedback(raw, transcript, { weekNumber, includeInteractive });
    const structure = structurePoint(raw.structure, transcript, weekNumber);
    const cuePoints = cuePointEvidence(raw.cuePoints, transcript, cueLabels);
    const cueChecklist = cueChecklistFromEvidence(raw.cuePoints, transcript, cueLabels);
    await writeEvalCache(supabase, {
      cacheKey,
      endpoint: '/api/speaking/evaluate',
      model: 'openai/gpt-oss-20b',
      response: { ...validated, structure, cuePoints, cueChecklist },
    });
  }
  const cuePoints = cuePointEvidence(raw.cuePoints, transcript, cueLabels);
  const cueChecklist = cueChecklistFromEvidence(raw.cuePoints, transcript, cueLabels);
  return {
    validated,
    structure: structurePoint(raw.structure, transcript, weekNumber),
    cuePoints,
    cueChecklist,
    cacheHit,
    promptTokens,
    completionTokens,
  };
}
