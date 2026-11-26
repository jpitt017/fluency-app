import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminSupabase } from '@/utils/supabase/admin';

/**
 * Approximate Groq pricing for cost telemetry:
 * - openai/gpt-oss-20b: ~$0.10 / 1M input tokens, ~$0.50 / 1M output tokens
 * - whisper-large-v3-turbo: ~$0.04 / hour ($0.0000111 / sec)
 */
export function estimateAiCostUsd(params: {
  promptTokens?: number;
  completionTokens?: number;
  audioSeconds?: number;
  cacheHit?: boolean;
}): number {
  if (params.cacheHit) return 0;
  const promptCost = ((params.promptTokens ?? 0) / 1_000_000) * 0.1;
  const completionCost = ((params.completionTokens ?? 0) / 1_000_000) * 0.5;
  const whisperCost = (params.audioSeconds ?? 0) * (0.04 / 3600);
  return Number((promptCost + completionCost + whisperCost).toFixed(6));
}

export async function logAiRequest(
  supabase: SupabaseClient | null,
  params: {
    endpoint: string;
    model: string;
    statusCode: number;
    latencyMs: number;
    cacheHit?: boolean;
    audioSeconds?: number;
    inputChars?: number;
    promptTokens?: number;
    completionTokens?: number;
    errorMessage?: string | null;
  },
  isSignedIn = false,
): Promise<void> {
  // Authenticated callers retain their JWT so auth.uid() remains authoritative.
  // Anonymous or unavailable sessions use the trusted server client, whose
  // auth.uid() is null; no user id is ever passed as an RPC argument.
  const logger = isSignedIn && supabase ? supabase : createAdminSupabase();
  if (!logger) return;
  try {
    const estimatedCostUsd = estimateAiCostUsd({
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      audioSeconds: params.audioSeconds,
      cacheHit: params.cacheHit,
    });

    await logger.rpc('log_ai_request', {
      p_endpoint: params.endpoint,
      p_model: params.model,
      p_status_code: params.statusCode,
      p_latency_ms: Math.max(0, Math.round(params.latencyMs)),
      p_cache_hit: Boolean(params.cacheHit),
      p_audio_seconds: Math.max(0, Math.round(params.audioSeconds ?? 0)),
      p_input_chars: Math.max(0, Math.round(params.inputChars ?? 0)),
      p_prompt_tokens: Math.max(0, Math.round(params.promptTokens ?? 0)),
      p_completion_tokens: Math.max(0, Math.round(params.completionTokens ?? 0)),
      p_estimated_cost_usd: estimatedCostUsd,
      p_error_message: params.errorMessage ?? null,
    });
  } catch {
    /* Non-blocking observability log */
  }
}
