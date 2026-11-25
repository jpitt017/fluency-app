'use client';

import { useEffect } from 'react';

const SECTION_IDS = new Set([
  'grammar-practice', 'vocabulary-practice', 'reading-practice',
  'listening-practice', 'speaking-practice', 'writing-practice',
]);

/** Focus a dashboard deep link, but never move focus on an ordinary week visit. */
export default function FocusWeekSection({ week }: { week: number }) {
  useEffect(() => {
    let activeTarget: HTMLElement | null = null;
    function focusSection() {
      activeTarget?.removeAttribute('data-week-link-target');
      activeTarget = null;
      const id = window.location.hash.slice(1);
      if (!SECTION_IDS.has(id)) return;
      const section = document.getElementById(id);
      // Later weeks do not have activities yet. Land on their explanation
      // instead of silently leaving the learner at the top of the page.
      const target = section ?? document.getElementById('week-activities-unavailable');
      if (!target) return;
      activeTarget = target;
      // Next's client navigation uses history.pushState, which does not update
      // CSS :target reliably. Keep the sticky-header offset for both kinds of
      // navigation without changing ordinary practice-step scrolling.
      target.setAttribute('data-week-link-target', '');
      target.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
    }

    focusSection();
    window.addEventListener('hashchange', focusSection);
    return () => {
      window.removeEventListener('hashchange', focusSection);
      activeTarget?.removeAttribute('data-week-link-target');
    };
  }, [week]);
  return null;
}
