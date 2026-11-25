'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

type Page = { id: string; content: ReactNode };

/**
 * One question at a time inside a practice step. The page panels stay mounted
 * but hidden, so moving between items or steps never discards a draft or its
 * feedback. The step itself remains separately navigable, including when a
 * learner wants to finish a partial practice.
 */
export default function PracticeItemPager({
  label,
  items,
  initiallyAnswered,
  visibleIds,
  selectedItemId,
  onSelectItem,
}: {
  label: string;
  items: Page[];
  initiallyAnswered: Record<string, unknown>;
  /** Adaptive items can disappear from navigation without losing their state. */
  visibleIds?: ReadonlySet<string>;
  /** Optional controlled selection for a caller that remembers its position. */
  selectedItemId?: string;
  onSelectItem?: (id: string) => void;
}) {
  const baseId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const visible = visibleIds ? items.filter((item) => visibleIds.has(item.id)) : items;
  const [localSelectedId, setLocalSelectedId] = useState(() =>
    visible.find((item) => !Object.hasOwn(initiallyAnswered, item.id))?.id ?? visible[0]?.id ?? '',
  );
  const [focusRequest, setFocusRequest] = useState(0);
  const selectedIndex = Math.max(0, visible.findIndex((item) => item.id === (selectedItemId ?? localSelectedId)));
  const total = visible.length;

  // Only an explicit Previous/Next item action moves focus or scrolls. Entering
  // a step still follows the existing step-heading navigation and ordinary
  // visits never move the page. Keep the current item clear of the sticky bar.
  useEffect(() => {
    if (!focusRequest) return;
    const heading = headingRef.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    heading.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
  }, [focusRequest]);

  function show(index: number, focusHeading = false) {
    const item = visible[index];
    if (!item) return;
    if (onSelectItem) onSelectItem(item.id);
    else setLocalSelectedId(item.id);
    if (focusHeading) setFocusRequest((value) => value + 1);
  }

  // The progress bar is a real tab list: one tab stop, arrow keys to move, and
  // Home/End to jump. A mouse or touch user can tap any segment directly.
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % total;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + total - 1) % total;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = total - 1;
    else return;
    event.preventDefault();
    show(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="space-y-2">
      {total > 0 && (
        <>
          <h4 ref={headingRef} tabIndex={-1} aria-live="polite" className="scroll-mt-20 text-sm font-semibold text-stone-700">
            Item {selectedIndex + 1} of {total}
          </h4>
          <div
            role="progressbar"
            aria-label={`${label} item position`}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={selectedIndex + 1}
            aria-valuetext={`Item ${selectedIndex + 1} of ${total}`}
            className="sr-only"
          />
          <div
            role="tablist"
            aria-label={`${label} item progress`}
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(1.5rem, 1fr))' }}
          >
            {visible.map((item, index) => {
              const panelIndex = items.indexOf(item);
              return (
                <button
                  key={item.id}
                  ref={(node) => { tabRefs.current[index] = node; }}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${panelIndex}`}
                  aria-label={`Go to item ${index + 1} of ${total}`}
                  aria-selected={index === selectedIndex}
                  aria-controls={`${baseId}-panel-${panelIndex}`}
                  tabIndex={index === selectedIndex ? 0 : -1}
                  onClick={() => show(index)}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                  className="flex min-h-11 min-w-6 items-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                >
                  <span aria-hidden="true" className={`block h-2 w-full rounded-full ${index <= selectedIndex ? 'bg-indigo-600' : 'bg-stone-200'}`} />
                </button>
              );
            })}
          </div>
        </>
      )}
      {items.map((item, index) => {
        const position = visible.indexOf(item);
        return (
          <div
            key={item.id}
            role="tabpanel"
            id={`${baseId}-panel-${index}`}
            aria-labelledby={position < 0 ? undefined : `${baseId}-tab-${index}`}
            tabIndex={position >= 0 && position === selectedIndex ? 0 : -1}
            hidden={position < 0 || position !== selectedIndex}
          >
            {item.content}
          </div>
        );
      })}
      {total > 0 && (
        <div role="group" aria-label={`${label} item navigation`} className="flex justify-between gap-2">
          <button
            type="button"
            disabled={selectedIndex === 0}
            onClick={() => show(selectedIndex - 1, true)}
            className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            Previous item
          </button>
          <button
            type="button"
            disabled={selectedIndex === total - 1}
            onClick={() => show(selectedIndex + 1, true)}
            className="min-h-11 rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-40"
          >
            Next item
          </button>
        </div>
      )}
    </div>
  );
}
