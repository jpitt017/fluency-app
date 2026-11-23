import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { landingPath } from '@/lib/auth/email-links.mjs';

/**
 * The site the link was opened on, as a bare origin.
 *
 * `request.nextUrl.origin` is the address the server is bound to, which behind a
 * proxy can differ from the host the visitor used. A redirect must stay on the
 * host in the link, or a session cookie set here would not be sent back with the
 * next page. `x-forwarded-host` is what the proxy saw; the request host is the
 * fallback.
 */
function siteOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (!forwardedHost) return new URL(request.url).origin;
  const proto = forwardedProto ?? (request.url.startsWith('https:') ? 'https' : 'http');
  return `${proto}://${forwardedHost}`;
}

/**
 * The only route that turns an emailed auth link into a session.
 *
 * Two link shapes arrive here:
 *
 * - `?token_hash=…&type=…` from our own email templates. The token is in the
 *   query string, so the server can verify it with `verifyOtp` and set cookies.
 *   This is the shape that works when the link is opened in a different browser
 *   from the one that asked for it.
 * - `?code=…` from a PKCE flow. Exchanged with `exchangeCodeForSession`, which
 *   needs the code verifier cookie set by the browser that started the flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = siteOrigin(request);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next');
  // Decoded once more on top of URLSearchParams: a `next` that a mail template
  // received already-encoded (`%2Flogin%3F…`) survives double encoding intact.
  let decodedNext = next;
  try {
    if (next?.includes('%')) decodedNext = decodeURIComponent(next);
  } catch {
    /* Malformed escape: fall through with the raw value and let the guard reject it. */
  }
  const safeNext = landingPath(decodedNext, type);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key && (code || (tokenHash && type))) {
    const cookieStore = await cookies();
    const isHttps =
      request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
    const isIframe =
      request.headers.get('sec-fetch-dest') === 'iframe' ||
      request.headers.get('sec-fetch-site') === 'cross-site';
    const iframeCookiePatch: Partial<CookieOptions> =
      isHttps && isIframe ? { sameSite: 'none', secure: true, partitioned: true } : {};

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, ...iframeCookiePatch }),
            );
          } catch {
            /* Read-only request context */
          }
        },
      },
    });

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${safeNext}`);
      }
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error) {
        return NextResponse.redirect(`${origin}${safeNext}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
