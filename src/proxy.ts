import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const AI_ENDPOINT_UNITS: Record<string, number> = {
  '/api/speaking/chat': 1,
  '/api/speaking/evaluate': 4,
  '/api/writing/correct': 2,
  '/api/checkpoints/evaluate': 5,
  '/api/checkpoints/writing': 3,
  '/api/lessons/generate': 5,
};

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Keep the site available when auth is not configured; protected API routes
  // fail closed below rather than allowing an unmetered provider request.
  if (!supabaseUrl || !supabaseKey) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentication and usage controls are not configured.' }, { status: 503 });
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname.replace(/\/$/, '');
  const units = AI_ENDPOINT_UNITS[pathname];

  if (units) {
    if (!user) return NextResponse.json({ error: 'Sign in to use AI learning features.' }, { status: 401 });

    const { data, error } = await supabase.rpc('consume_ai_usage', {
      p_endpoint: pathname,
      p_units: units,
    });

    // Fail closed on RPC failures; never send an unmetered request to an AI API.
    if (error || !data || typeof data.allowed !== 'boolean') {
      console.error('AI usage guard failed:', error?.message ?? 'Invalid usage guard response');
      return NextResponse.json({ error: 'AI services are temporarily unavailable. Please try again shortly.' }, { status: 503 });
    }

    if (!data.allowed) {
      const retryAfter = Math.max(1, Number(data.retry_after_seconds) || 60);
      return NextResponse.json(
        { error: data.reason === 'daily_limit' ? 'Your daily AI practice allowance has been reached. Please try again later.' : 'You are practising too quickly. Please wait before trying again.', retryAfterSeconds: retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter), 'X-AI-Usage-Remaining-Minute': '0' } },
      );
    }

    response.headers.set('X-AI-Usage-Remaining-Minute', String(data.minute_remaining ?? 0));
    response.headers.set('X-AI-Usage-Remaining-Day', String(data.daily_units_remaining ?? 0));
  }

  if (!user && pathname.startsWith('/sessions')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/sessions/:path*',
    '/api/speaking/:path*',
    '/api/writing/:path*',
    '/api/checkpoints/:path*',
    '/api/lessons/generate',
  ],
};
