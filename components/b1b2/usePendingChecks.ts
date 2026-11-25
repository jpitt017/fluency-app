'use client';

import { useState } from 'react';

/** Don't take a Finish snapshot while a counted answer is being checked/saved. */
export function usePendingChecks() {
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  function setChecking(id: string, checking: boolean) {
    setPending((previous) => {
      const next = new Set(previous);
      if (checking) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return { checking: pending.size > 0, setChecking };
}
