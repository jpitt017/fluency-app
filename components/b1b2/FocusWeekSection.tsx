'use client';

import { useEffect } from 'react';

const SECTION_IDS = new Set([
  'grammar-practice', 'vocabulary-practice', 'reading-practice',
  'listening-practice', 'speaking-practice', 'writing-practice',
]);

/** Focus a dashboard deep link, but never move focus on an ordinary week visit. */
export default function FocusWeekSection({ week }: { week: number }) {
  useEffect(() => {
    function focusSection() {
      const id = window.location.hash.slice(1);
      if (!SECTION_IDS.has(id)) return;
      const section = document.getElementById(id);
      // Later weeks do not have activities yet. Land on their explanation
      // instead of silently leaving the learner at the top of the page.
      const target = section ?? document.getElementById('week-activities-unavailable');
      if (!target) return;
      target.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      if (!section) target.scrollIntoView({ behavior: 'instant', block: 'start' });
    }

    focusSection();
    window.addEventListener('hashchange', focusSection);
    return () => window.removeEventListener('hashchange', focusSection);
  }, [week]);
  return null;
}
