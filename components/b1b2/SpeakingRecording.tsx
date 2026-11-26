'use client';

import { useState } from 'react';

export default function SpeakingRecording({
  recordingUrl,
  label = 'Speaking recording',
  dataTestId,
}: {
  recordingUrl?: string | null;
  label?: string;
  dataTestId?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!recordingUrl || failed) {
    return (
      <p className="rounded-lg border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-600">
        Recording unavailable – ask the learner to re-record
      </p>
    );
  }

  return (
    <audio
      controls
      preload="none"
      src={recordingUrl}
      aria-label={label}
      data-testid={dataTestId}
      onError={() => setFailed(true)}
      className="h-8 w-full"
    />
  );
}
