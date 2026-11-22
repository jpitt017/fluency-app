'use client';

import { useEffect } from 'react';

/** Remember the last week opened in this browser, without tracking prefetches. */
export default function RememberWeek({ week }: { week: number }) {
  useEffect(() => {
    document.cookie = `learner_week=${week}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent('learner-week', { detail: week }));
  }, [week]);
  return null;
}
