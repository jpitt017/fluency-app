import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dailyLimitMessage } from './usage-messages.mjs';

export type AiEndpoint =
  | '/api/speaking/chat'
  | '/api/speaking/evaluate'
  | '/api/writing/correct'
  | '/api/review/check-rewrite';

export interface AiGuardResult {
  allowed: boolean;
  userId?: string;
  tier?: 'free' | 'pilot' | 'pro' | 'staff';
  headers: Record<string, string>;
  response?: NextResponse;
}

/**
 * Atomic, route-level AI usage enforcement backed by Postgres `consume_ai_usage`
 * (which acquires a per-user advisory xact lock in one transaction).
 * Enforcing inside each API route guarantees quota checks even if middleware/proxy
 * is bypassed and supports dynamic unit weighting (e.g. audio Whisper > text writing).
 */
export async function enforceAiUsage(
  supabase: SupabaseClient | null,
  endpoint: AiEndpoint,
  units: number,
): Promise<AiGuardResult> {
  if (!supabase) {
    return {
      allowed: false,
      headers: {},
      response: NextResponse.json(
        { error: 'Authentication and usage controls are not configured.' },
        { status: 503 },
      ),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      allowed: false,
      headers: {},
      response: NextResponse.json({ error: 'Sign in to use AI learning features.' }, { status: 401 }),
    };
  }

  const safeUnits = Math.max(1, Math.min(20, Math.round(units)));
  const { data, error } = await supabase.rpc('consume_ai_usage', {
    p_endpoint: endpoint,
    p_units: safeUnits,
  });

  if (error || !data || typeof data.allowed !== 'boolean') {
    console.error('consume_ai_usage failed:', error?.message ?? 'Invalid response');
    return {
      allowed: false,
      userId: user.id,
      headers: {},
      response: NextResponse.json(
        { error: 'AI services are temporarily unavailable. Please try again shortly.' },
        { status: 503 },
      ),
    };
  }

  const tier: NonNullable<AiGuardResult['tier']> = ['pilot', 'pro', 'staff'].includes(data.tier) ? data.tier : 'free';
  const headers: Record<string, string> = {
    'X-AI-Usage-Remaining-Minute': String(data.minute_remaining ?? 0),
    'X-AI-Usage-Remaining-Day': String(data.daily_units_remaining ?? 0),
    'X-AI-Usage-Tier': tier,
    'X-AI-Daily-Limit': String(data.daily_unit_limit ?? ({ free: 30, pilot: 120, pro: 180, staff: 1000 }[tier])),
    'X-AI-Units-Charged': String(safeUnits),
  };

  if (!data.allowed) {
    const retryAfter = Math.max(1, Number(data.retry_after_seconds) || 60);
    return {
      allowed: false,
      userId: user.id,
      tier,
      headers,
      response: NextResponse.json(
        {
          error:
            data.reason === 'daily_limit'
              ? dailyLimitMessage(tier, process.env.NEXT_PUBLIC_PILOT_PRICING_ENABLED === 'true')
              : 'You are practising too quickly. Please wait a few seconds before trying again.',
          retryAfterSeconds: retryAfter,
          tier,
        },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': String(retryAfter),
          },
        },
      ),
    };
  }

  return {
    allowed: true,
    userId: user.id,
    tier,
    headers,
  };
}
