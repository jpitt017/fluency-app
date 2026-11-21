import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client for server-only answer checking. Never import this from
 * a client component: it bypasses RLS by design.
 */
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
