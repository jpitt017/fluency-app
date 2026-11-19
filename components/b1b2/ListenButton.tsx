'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Listening inputs ship as transcripts with no audio files yet. Until recorded
 * assets exist, the browser reads the transcript aloud so the block still
 * trains listening (accent hint, adjustable speed, no text shown while playing).
 */
export default function ListenButton({ text, accent }: { text: string; accent: string | null }) {
  const [speaking, setSpeaking] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [rate, setRate] = useState(0.95);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  function play() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
      setUnsupported(true);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((voice) => voice.lang === 'en-GB') ??
      voices.find((voice) => voice.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;
    utterance.lang = preferred?.lang ?? 'en-GB';
    utterance.rate = rate;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    utteranceRef.current = utterance;
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  function stop() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  if (unsupported) {
    return <p className="text-xs text-slate-500">This browser cannot read the transcript aloud — open the text below instead.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={speaking ? stop : play}
        className={`rounded-lg px-3 py-2 text-sm font-semibold ${speaking ? 'bg-slate-900 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
      >
        {speaking ? '■ Stop audio' : '▶ Listen'}
      </button>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        Speed
        <input
          type="range"
          min={0.6}
          max={1.2}
          step={0.05}
          value={rate}
          onChange={(event) => setRate(Number(event.target.value))}
          className="w-24 accent-indigo-600"
        />
        <span className="w-8 tabular-nums">{rate.toFixed(2)}×</span>
      </label>
      <span className="text-xs text-slate-500">{accent ? `${accent} accent` : 'synthesised audio'}</span>
    </div>
  );
}
