import { NextResponse } from 'next/server';

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};

// Limit: 10 AI evaluation requests per 60 seconds per user/IP
const WINDOW_SIZE_MS = 60 * 1000; 
const MAX_REQUESTS = 10;

export function checkRateLimit(identifier: string): { success: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = store[identifier];

  if (!record || now > record.resetTime) {
    store[identifier] = { count: 1, resetTime: now + WINDOW_SIZE_MS };
    return { success: true };
  }

  if (record.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { success: false, retryAfter };
  }

  record.count += 1;
  return { success: true };
}