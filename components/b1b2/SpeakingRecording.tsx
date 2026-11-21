'use client';

import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { speakPhrase } from '@/lib/b1b2/speech';

export default function SpeakingRecording({
  recordingUrl,
  transcript,
}: {
  recordingUrl?: string | null;
  transcript?: string | null;
}) {
  const [failed, setFailed] = useState(false);

  if (!recordingUrl || failed) {
    if (!transcript?.trim()) {
      return <p className="text-xs text-stone-500">Recording unavailable — no transcript to read aloud.</p>;
    }
    return (
      <div>
        <button
          type="button"
          onClick={() => void speakPhrase(transcript, 'en-GB')}
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
        >
          <Volume2 className="h-3.5 w-3.5" /> Play transcript with a UK voice
        </button>
        <p className="mt-1 text-[10px] font-semibold text-amber-700">Temporary voice</p>
      </div>
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
