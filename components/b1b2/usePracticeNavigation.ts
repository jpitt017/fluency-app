'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/** Focus without the browser's implicit jump, then scroll the section to top. */
function focusAndScroll(section: HTMLElement | null, heading: HTMLElement | null) {
  if (!section || !heading) return;
  heading.focus({ preventScroll: true });
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  section.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
}

/** Used only after a learner action, never on the initial page load. */
export function usePracticeNavigation() {
  const sectionRef = useRef<HTMLElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const targetRef = useRef<RefObject<HTMLElement | null> | null>(null);
  const [navigation, setNavigation] = useState(0);

  useEffect(() => {
    if (!navigation) return;
    // A step's content may not exist until after navigation has rendered it.
    const target = targetRef.current?.current;
    if (target) focusAndScroll(target, target);
    else focusAndScroll(sectionRef.current, stepHeadingRef.current);
  }, [navigation]);

  return {
    sectionRef,
    stepHeadingRef,
    // The effect runs after React has rendered the new step or word page.
    focusStep: (target?: RefObject<HTMLElement | null>) => {
      targetRef.current = target ?? null;
      setNavigation((value) => value + 1);
    },
  };
}

/** The next-task button uses the same motion and focus rules. */
export function focusNextTask(id: string) {
  if (typeof window === 'undefined') return;
  // WeekTaskLayout keeps one task open at a time: announce the jump so the
  // target task opens before focus lands on its heading. The hash records the
  // open task, so a reload comes back to it, without scrolling on its own.
  window.dispatchEvent(new CustomEvent('week-task:open', { detail: id }));
  if (!window.location.hash.includes(`#${id}`)) {
    window.history.replaceState(null, '', `#${id}`);
  }
  // Focus after the opened task has rendered: a hidden heading cannot take
  // focus, and the open state lands on the next frame at the latest.
  requestAnimationFrame(() => {
    const section = document.getElementById(id);
    const heading = section?.querySelector<HTMLElement>('[data-practice-step-heading]')
      ?? section?.querySelector<HTMLElement>('h2');
    focusAndScroll(section, heading ?? null);
  });
}
