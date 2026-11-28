import { createBrowserClient, type CookieOptionsWithName } from '@supabase/ssr';
import { browserDeletionFetch } from '@/lib/b1b2/deletion-epoch.mjs';

function isEmbeddedHttpsIframe(): boolean {
  if (typeof window === 'undefined' || window.location.protocol !== 'https:') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function getBrowserCookieOptions(): CookieOptionsWithName | undefined {
  if (typeof window === 'undefined') return undefined;
  const isHttps = window.location.protocol === 'https:';
  if (isEmbeddedHttpsIframe()) {
    return {
      path: '/',
      sameSite: 'none',
      secure: true,
      partitioned: true,
    };
  }
  return {
    path: '/',
    sameSite: 'lax',
    secure: isHttps,
  };
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables. Please check your Vercel project settings.'
    );
  }

  return createBrowserClient(supabaseUrl, supabaseKey, {
    cookieOptions: getBrowserCookieOptions(),
    global: { fetch: browserDeletionFetch(fetch, supabaseUrl) },
  });
}
