import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { DELETION_EPOCH_HEADER, DELETION_OWNER_HEADER } from '@/lib/b1b2/deletion-epoch.mjs';

/**
 * Service-role client for server-only answer checking. Never import this from
 * a client component: it bypasses RLS by design.
 */
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // E2E jobs provide only the isolated project key; production environments
  // continue to use the existing SUPABASE_SERVICE_ROLE_KEY setting.
  const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const restOrigin = `${url.replace(/\/$/, '')}/rest/v1/`;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!target.startsWith(restOrigin)) return fetch(input, init);
      const outgoing = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      try {
        // Proxy pins these to the authenticated inbound request, so even a
        // service-role insert after a slow provider call retains its old epoch.
        const inbound = await headers();
        const owner = inbound.get(DELETION_OWNER_HEADER);
        const epoch = inbound.get(DELETION_EPOCH_HEADER);
        if (owner) outgoing.set(DELETION_OWNER_HEADER, owner);
        if (epoch) outgoing.set(DELETION_EPOCH_HEADER, epoch);
      } catch {
        // A missing request context must not silently turn a learner request
        // into a privileged, unfenced write. Background cron requests have an
        // actual request context but deliberately no learner owner header.
        outgoing.set(DELETION_OWNER_HEADER, 'unverified');
        outgoing.set(DELETION_EPOCH_HEADER, 'missing');
      }
      return fetch(input, { ...init, headers: outgoing });
    } },
  });
}
