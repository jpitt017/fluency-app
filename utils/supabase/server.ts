import { cookies, headers } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { DELETION_EPOCH_HEADER, DELETION_OWNER_HEADER } from '@/lib/b1b2/deletion-epoch.mjs';

/**
 * Supabase client for server components and route handlers.
 *
 * Cookie writes can throw in a read-only server context (for example while
 * rendering a server component), which is expected: the proxy refreshes the
 * session, so the component only needs to read it.
 */
export async function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  const headerStore = await headers();
  const isHttps = headerStore.get('x-forwarded-proto') === 'https';
  const isIframe =
    headerStore.get('sec-fetch-dest') === 'iframe' ||
    headerStore.get('sec-fetch-site') === 'cross-site';
  const iframeCookiePatch: Partial<CookieOptions> =
    isHttps && isIframe ? { sameSite: 'none', secure: true, partitioned: true } : {};

  const deletionOwner = headerStore.get(DELETION_OWNER_HEADER);
  const deletionEpoch = headerStore.get(DELETION_EPOCH_HEADER);
  return createServerClient(url, key, {
    global: { headers: {
      ...(deletionOwner ? { [DELETION_OWNER_HEADER]: deletionOwner } : {}),
      ...(deletionEpoch ? { [DELETION_EPOCH_HEADER]: deletionEpoch } : {}),
    } },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, ...iframeCookiePatch }),
          );
        } catch {
          // Read-only context: the proxy owns refresh.
        }
      },
    },
  });
}
