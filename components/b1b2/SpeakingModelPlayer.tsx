'use client';

import { useState } from 'react';
import { speakPhrase } from '@/lib/b1b2/speech';

export default function SpeakingModelPlayer({ text, audioUrl }: { text: string; audioUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (audioUrl && !failed) return <audio controls preload="none" className="w-full" src={audioUrl} onError={() => setFailed(true)} />;
  return <div className="space-y-1"><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => void speakPhrase(text, 'en-GB', 1)}>Play temporary computer voice</button><p className="text-xs text-amber-700">Temporary computer voice</p></div>;
}
