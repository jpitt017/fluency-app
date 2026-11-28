import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import {
  DELETION_EPOCH_COOKIE, DELETION_EPOCH_HEADER, DELETION_OWNER_HEADER, DELETION_UPLOAD_EXPLICIT_HEADER,
  formatDeletionEpoch, parseDeletionEpoch,
} from '@/lib/b1b2/deletion-epoch.mjs';

const AI_PROTECTED_PATHS = new Set([
  '/api/speaking/chat',
  '/api/speaking/evaluate',
  '/api/speaking/transcribe',
  '/api/writing/correct',
  '/api/mediation/feedback',
  '/api/review/check-rewrite',
]);

export async function proxy(request: NextRequest) {
  // A browser workflow may explicitly pin its own generation before a long
  // operation. It is not authorization; bind it to the verified user below.
  // Never trust an incoming owner header.
  const requestedEpoch = request.headers.get(DELETION_EPOCH_HEADER);
  const forwarded = new Headers(request.headers);
  forwarded.delete(DELETION_EPOCH_HEADER);
  forwarded.delete(DELETION_OWNER_HEADER);
  forwarded.delete(DELETION_UPLOAD_EXPLICIT_HEADER);
  let response = NextResponse.next({ request: { headers: forwarded } });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname.replace(/\/$/, '');
  const isAiProtected = AI_PROTECTED_PATHS.has(pathname);
  // This endpoint serves only authored teaching examples. It needs neither a
  // session nor an AI provider, including when Supabase is unavailable.
  const isPublicSentenceExample = pathname === '/api/week/sentence/example' && request.method === 'GET';

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
    if (request.nextUrl.pathname.startsWith('/api/') && pathname !== '/api/lessons/generate' && !isPublicSentenceExample) {
      console.error('[proxy] authentication and usage controls are not configured');
      return NextResponse.json(
        { error: pathname.startsWith('/api/teacher/')
          ? 'Authentication and usage controls are not configured.'
          : 'Something went wrong. Please try again, or message your teacher.' },
        { status: 503 },
      );
    }
    return response;
  }

  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith('sb-'));
  // Signed-out page requests need no token refresh; protected AI endpoints always verify.
  if (!isAiProtected && !hasAuthCookie) return response;

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
        forwarded.set('cookie', request.headers.get('cookie') || '');
        response = NextResponse.next({ request: { headers: forwarded } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, ...iframeCookiePatch }),
        );
      },
    },
  });

  // The incoming cookie is fixed for this request, even if another tab finishes
  // deletion before its later database writes. Missing/unverified context fails
  // closed for post-deletion writes once the explicitly staged fence is on.
  let cookieToSet: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const oldEpoch = parseDeletionEpoch(request.cookies.get(DELETION_EPOCH_COOKIE)?.value);
      const explicit = requestedEpoch === null ? null : parseDeletionEpoch(`${user.id}.${requestedEpoch}`);
      forwarded.set(DELETION_OWNER_HEADER, user.id);
      // Old browser tabs do not send the workflow header. Do not mistake a
      // cookie refreshed by another tab for proof that this tab is current.
      forwarded.set(DELETION_UPLOAD_EXPLICIT_HEADER, explicit ? '1' : '0');
      forwarded.set(DELETION_EPOCH_HEADER, requestedEpoch !== null
        ? explicit?.generation ?? 'missing'
        : oldEpoch?.owner === user.id.toLowerCase() ? oldEpoch.generation : 'missing');

      // A page navigation obtains a fresh epoch for future requests. A POST
      // must never refresh its own epoch after it started. The 0080 schema has
      // no marker column, so a missing-column error simply leaves it absent.
      if (request.method === 'GET' && !pathname.startsWith('/api/')) {
        const marker = await supabase.from('profiles').select('data_deletion_generation').eq('id', user.id).maybeSingle();
        const next = formatDeletionEpoch(user.id, marker.data?.data_deletion_generation);
        if (!marker.error && next) {
          cookieToSet = next;
          forwarded.set(DELETION_EPOCH_HEADER, parseDeletionEpoch(next)!.generation);
        }
      }
    } else if (hasAuthCookie) {
      forwarded.set(DELETION_OWNER_HEADER, 'unverified');
      forwarded.set(DELETION_EPOCH_HEADER, 'missing');
    }
  } catch {
    if (hasAuthCookie) {
      forwarded.set(DELETION_OWNER_HEADER, 'unverified');
      forwarded.set(DELETION_EPOCH_HEADER, 'missing');
    }
    // A refresh failure must not turn into a proxy-only authentication decision.
    // Protected routes fail closed through their own authentication checks.
  }

  // Rebuild after setting request headers, retaining any session-refresh
  // cookies written by @supabase/ssr. These headers are forwarded internally,
  // not added to the learner's response.
  const sessionCookies = response.cookies.getAll();
  response = NextResponse.next({ request: { headers: forwarded } });
  sessionCookies.forEach((cookie) => response.cookies.set(cookie));
  if (cookieToSet) {
    response.cookies.set(DELETION_EPOCH_COOKIE, cookieToSet, {
      path: '/', httpOnly: false, sameSite: isHttps && isIframe ? 'none' : 'lax', secure: isHttps,
      ...(isHttps && isIframe ? { partitioned: true } : {}),
    });
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|audio/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|vtt|ico)$).*)',
  ],
};
