import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const AI_PROTECTED_PATHS = new Set([
  '/api/speaking/chat',
  '/api/speaking/evaluate',
  '/api/writing/correct',
  '/api/checkpoints/evaluate',
  '/api/checkpoints/writing',
  '/api/lessons/generate',
]);

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail closed on protected AI API routes when auth is not configured.
  if (!supabaseUrl || !supabaseKey) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Authentication and usage controls are not configured.' },
        { status: 503 },
      );
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname.replace(/\/$/, '');

  // Auth gate at the edge; atomic quota enforcement (with per-request audio/text
  // unit weighting) runs inside each API route via enforceAiUsage().
  if (AI_PROTECTED_PATHS.has(pathname) && !user) {
    return NextResponse.json({ error: 'Sign in to use AI learning features.' }, { status: 401 });
  }

  return response;
}

export const config = {
  matcher: [
    '/api/speaking/:path*',
    '/api/writing/:path*',
    '/api/checkpoints/:path*',
    '/api/lessons/generate',
  ],
};
