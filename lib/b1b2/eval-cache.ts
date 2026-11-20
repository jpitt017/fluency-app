import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export function buildEvalCacheKey(params: {
  endpoint: string;
  model: string;
  prompt: string;
  input: string;
  variety?: string;
}): string {
  const normalizedInput = params.input.trim().replace(/\s+/g, ' ');
  const normalizedPrompt = params.prompt.trim().replace(/\s+/g, ' ');
  const raw = JSON.stringify({
    v: 1,
    endpoint: params.endpoint,
    model: params.model,
    variety: params.variety ?? 'British',
    prompt: normalizedPrompt,
    input: normalizedInput,
  });
  return createHash('sha256').update(raw).digest('hex');
}

export async function readEvalCache<T>(supabase: SupabaseClient | null, cacheKey: string): Promise<T | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('get_ai_eval_cache', { p_cache_key: cacheKey });
    if (error || !data) return null;
    return data as T;
  } catch {
    return null;
  }
}

export async function writeEvalCache(
  supabase: SupabaseClient | null,
  params: { cacheKey: string; endpoint: string; model: string; response: unknown },
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc('set_ai_eval_cache', {
      p_cache_key: params.cacheKey,
      p_endpoint: params.endpoint,
      p_model: params.model,
      p_response: params.response,
    });
  } catch {
    /* Non-blocking cache write */
  }
}
