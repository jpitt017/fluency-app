'use client';

import { useState } from 'react';

export default function SpeakingRecording({
  recordingUrl,
}: {
  recordingUrl?: string | null;
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
      onError={() => setFailed(true)}
      className="h-8 w-full"
    />
  );
}
