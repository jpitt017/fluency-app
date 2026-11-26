'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Runs once when an authenticated page is actually mounted in the browser.
 * Server Components may be rendered for an `_rsc` prefetch, but that does not
 * mount this effect, so prefetches never call the progress-mutating RPC.
 */
export default function RefreshCurrentWeekOnVisit({ enabled, currentWeek }: { enabled: boolean; currentWeek?: number }) {
  const started = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    void fetch('/api/week/refresh', { method: 'POST', cache: 'no-store', credentials: 'same-origin', keepalive: true })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as { currentWeek?: unknown };
        if (currentWeek !== undefined && Number.isInteger(payload.currentWeek) && payload.currentWeek !== currentWeek) router.refresh();
      })
      .catch(() => {
        // The rendered profile value remains usable if the optional refresh fails.
      });
  }, [currentWeek, enabled, router]);

  return null;
}
