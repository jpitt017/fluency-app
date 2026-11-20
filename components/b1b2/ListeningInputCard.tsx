'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Eye, EyeOff, Play, Square, Volume2 } from 'lucide-react';
import PracticeQuiz from '@/components/b1b2/PracticeQuiz';
import {
  loadEnglishVoices,
  parseAccentLanguages,
  pickVoiceForLang,
  type AccentPreference,
} from '@/lib/b1b2/speech';
import type { ContentInput } from '@/lib/b1b2/types';

const emptySubscribe = () => () => {};
function useSpeechSupported() {
  return useSyncExternalStore(
    emptySubscribe,
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
    () => true,
  );
}

function splitDialogueSegments(body: string): { speaker: string | null; text: string }[] {
  const parts = body
    .split(/(?=\b[A-Z][A-Z0-9 ]{1,18}:)/g)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) return [{ speaker: null, text: body }];
  return parts.map((segment) => {
    const match = segment.match(/^([A-Z][A-Z0-9 ]{1,18}):\s*(.+)$/);
    if (!match) return { speaker: null, text: segment };
    return { speaker: match[1].trim(), text: match[2].trim() };
  });
}

export default function ListeningInputCard({ input }: { input: ContentInput }) {
  const isListening = input.kind === 'listening';
  const hasStudioAudio = Boolean(input.audio_url);
  const [showTranscript, setShowTranscript] = useState(!isListening);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<0.85 | 1 | 1.1>(1);
  const [accentPref, setAccentPref] = useState<AccentPreference>('auto');
  const [activeSegment, setActiveSegment] = useState<number | null>(null);
  const speechSupported = useSpeechSupported();
  const cancelledRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const segments = useMemo(() => splitDialogueSegments(input.body), [input.body]);
  const accentLangs = useMemo(() => parseAccentLanguages(input.accent), [input.accent]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function updateAudioRate(nextRate: 0.85 | 1 | 1.1) {
    setRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  }

  function stopAudio() {
    cancelledRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);
    setActiveSegment(null);
  }

  async function playAudio(selectedRate = rate, selectedAccent = accentPref) {
    if (hasStudioAudio && audioRef.current) {
      audioRef.current.playbackRate = selectedRate;
      await audioRef.current.play();
      setPlaying(true);
      return;
    }

    if (!speechSupported || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const synth = window.speechSynthesis;
    cancelledRef.current = false;
    synth.cancel();

    const voices = await loadEnglishVoices();
    if (cancelledRef.current) return;

    const speakerPitches = [1.0, 0.93, 1.07, 0.97];
    const speakerOrder: string[] = [];

    setPlaying(true);

    segments.forEach((seg, idx) => {
      const utterance = new SpeechSynthesisUtterance(seg.text);
      utterance.rate = selectedRate;

      let sIdx = 0;
      if (seg.speaker) {
        sIdx = speakerOrder.indexOf(seg.speaker);
        if (sIdx === -1) {
          speakerOrder.push(seg.speaker);
          sIdx = speakerOrder.length - 1;
        }
        utterance.pitch = speakerPitches[sIdx % speakerPitches.length];
      }

      const targetLang =
        selectedAccent === 'auto'
          ? accentLangs[sIdx % accentLangs.length]
          : selectedAccent;
      utterance.lang = targetLang;

      const voice = pickVoiceForLang(voices, targetLang, sIdx);
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        if (!cancelledRef.current) setActiveSegment(idx);
      };

      utterance.onend = () => {
        if (idx === segments.length - 1 && !cancelledRef.current) {
          setPlaying(false);
          setActiveSegment(null);
        }
      };

      utterance.onerror = () => {
        if (!cancelledRef.current) {
          setPlaying(false);
          setActiveSegment(null);
        }
      };

      synth.speak(utterance);
    });
  }

  return (
    <article className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-white px-2.5 py-0.5 font-bold uppercase text-stone-700 ring-1 ring-stone-200">
            {input.kind}
          </span>
          <span className="font-semibold text-stone-900">{input.title}</span>
          {input.accent && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
              {input.accent}
            </span>
          )}
          {hasStudioAudio && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
              Studio audio
            </span>
          )}
          {input.duration_seconds ? <span className="text-stone-500">· {input.duration_seconds}s</span> : null}
          {input.word_count ? <span className="text-stone-500">· {input.word_count} words</span> : null}
        </div>

        <div className="flex items-center gap-2">
          {!isListening && (
            <button
              type="button"
              onClick={() => (playing ? stopAudio() : void playAudio(rate, accentPref))}
              disabled={!hasStudioAudio && !speechSupported}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-40"
            >
              {playing ? <Square className="h-3 w-3" /> : <Volume2 className="h-3.5 w-3.5 text-indigo-700" />}
              <span>{playing ? 'Stop audio' : 'Listen aloud'}</span>
            </button>
          )}
          {isListening && (
            <button
              type="button"
              onClick={() => setShowTranscript((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              {showTranscript ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{showTranscript ? 'Hide transcript' : 'Reveal transcript'}</span>
            </button>
          )}
        </div>
      </div>

      {hasStudioAudio && (
        <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <audio
              ref={audioRef}
              controls
              preload="metadata"
              src={input.audio_url ?? undefined}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              className="h-9 min-w-[220px] flex-1"
            />
            <div
              role="group"
              aria-label="Playback speed"
              className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-[11px] font-semibold"
            >
              {([0.85, 1, 1.1] as const).map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => updateAudioRate(speed)}
                  className={`rounded-md px-2 py-1 ${rate === speed ? 'bg-white text-indigo-700 shadow-2xs' : 'text-stone-600'}`}
                >
                  {speed === 1 ? '1.0×' : `${speed}×`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isListening && !hasStudioAudio && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            {!playing ? (
              <button
                type="button"
                onClick={() => void playAudio(rate, accentPref)}
                disabled={!speechSupported}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-800 disabled:bg-stone-300"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>Play audio</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopAudio}
                className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-800"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop audio</span>
              </button>
            )}

            <div
              role="group"
              aria-label="Playback speed"
              className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-[11px] font-semibold"
            >
              {([0.85, 1, 1.1] as const).map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => {
                    setRate(speed);
                    if (playing) void playAudio(speed, accentPref);
                  }}
                  className={`rounded-md px-2 py-1 ${rate === speed ? 'bg-white text-indigo-700 shadow-2xs' : 'text-stone-600'}`}
                >
                  {speed === 1 ? '1.0×' : `${speed}×`}
                </button>
              ))}
            </div>

            <div
              role="group"
              aria-label="English variety"
              className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-[11px] font-semibold"
            >
              {(
                [
                  ['auto', 'Mix'],
                  ['en-GB', 'UK'],
                  ['en-US', 'US'],
                  ['en-AU', 'AU'],
                ] as const
              ).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setAccentPref(code);
                    if (playing) void playAudio(rate, code);
                  }}
                  className={`rounded-md px-2 py-1 ${
                    accentPref === code ? 'bg-white text-indigo-700 shadow-2xs' : 'text-stone-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <span className="text-xs text-stone-500">
            {!speechSupported
              ? 'Browser speech playback unavailable — reveal transcript below.'
              : playing && activeSegment !== null
                ? `Segment ${activeSegment + 1}/${segments.length}${segments[activeSegment]?.speaker ? ` (${segments[activeSegment].speaker})` : ''}…`
                : showTranscript
                  ? 'Browser speech fallback · Transcript visible'
                  : 'Browser speech fallback · Transcript hidden'}
          </span>
        </div>
      )}

      {showTranscript ? (
        <div className="mt-3 space-y-2">
          {segments.length > 1 ? (
            <div className="space-y-2">
              {segments.map((seg, idx) => (
                <p
                  key={idx}
                  className={`rounded-lg px-3 py-2 text-sm leading-6 transition ${
                    playing && activeSegment === idx
                      ? 'bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200'
                      : 'text-stone-800'
                  }`}
                >
                  {seg.speaker && (
                    <strong className="mr-1.5 text-xs uppercase tracking-wide text-indigo-700">{seg.speaker}:</strong>
                  )}
                  {seg.text}
                </p>
              ))}
            </div>
          ) : (
            <p className="whitespace-pre-line text-sm leading-7 text-stone-800">{input.body}</p>
          )}
          <p className="text-[11px] uppercase tracking-wide text-stone-400">Source: {input.source_label}</p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-stone-300 bg-white/70 px-3.5 py-2.5 text-xs text-stone-600">
          Listen first (at natural speed or 0.85×) and answer the comprehension questions before revealing the transcript.
        </p>
      )}

      {input.questions?.length ? (
        <div className="mt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-stone-600">Comprehension check</h3>
          <PracticeQuiz
            compact
            items={input.questions.map((question, index) => ({
              id: `${input.id}-q${index}`,
              prompt: question.prompt,
              options: question.options,
              answer: question.answer,
              explanation: null,
            }))}
          />
        </div>
      ) : null}
    </article>
  );
}
