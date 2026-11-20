import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const AI_PROTECTED_PATHS = new Set([
  '/api/speaking/chat',
  '/api/speaking/evaluate',
  '/api/writing/correct',
  '/api/checkpoints/evaluate',
  '/api/checkpoints/writing',
]);

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname.replace(/\/$/, '');
  const isAiProtected = AI_PROTECTED_PATHS.has(pathname);

  // Forward Supabase PKCE / OTP callbacks that land on `/` directly to `/auth/callback`.
  if (
    pathname === '' &&
    (request.nextUrl.searchParams.has('code') ||
      (request.nextUrl.searchParams.has('token_hash') && request.nextUrl.searchParams.has('type')))
  ) {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = '/auth/callback';
    return NextResponse.redirect(callbackUrl);
  }

  // Fail closed on protected AI API routes when auth is not configured.
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder.supabase.co')) {
    if (request.nextUrl.pathname.startsWith('/api/') && pathname !== '/api/lessons/generate') {
      return NextResponse.json(
        { error: 'Authentication and usage controls are not configured.' },
        { status: 503 },
      );
    }
    return response;
  }

  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith('sb-'));
  // Signed-out page requests need no token refresh; protected AI endpoints always verify.
  if (!isAiProtected && !hasAuthCookie) {
    return response;
  }

  const isHttps =
    request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const isIframe =
    request.headers.get('sec-fetch-dest') === 'iframe' ||
    request.headers.get('sec-fetch-site') === 'cross-site';
  const iframeCookiePatch: Partial<CookieOptions> =
    isHttps && isIframe ? { sameSite: 'none', secure: true, partitioned: true } : {};

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, ...iframeCookiePatch }),
        );
      },
    },
  });

  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  // Auth gate at the edge; atomic quota enforcement (with per-request audio/text
  // unit weighting) runs inside each API route via enforceAiUsage().
  if (isAiProtected && !user) {
    return NextResponse.json({ error: 'Sign in to use AI learning features.' }, { status: 401 });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|audio/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|vtt|ico)$).*)',
  ],
};
