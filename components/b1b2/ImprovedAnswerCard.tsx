'use client';

import { useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { playImprovedAnswerTts, stopActiveAudio } from '@/lib/b1b2/speech';
import type { ImprovedHighlight } from '@/lib/b1b2/speaking-feedback.mjs';

type Segment =
  | { kind: 'plain'; text: string }
  | { kind: 'highlight'; text: string; highlight: ImprovedHighlight; index: number };

function segmentImprovedText(text: string, highlights: ImprovedHighlight[]): Segment[] {
  const capped = highlights.slice(0, 3);
  if (!text || !capped.length) return [{ kind: 'plain', text }];

  const valid = capped
    .map((highlight, index) => ({ highlight, index, pos: text.indexOf(highlight.substring) }))
    .filter((item) => item.pos >= 0 && item.highlight.substring.length > 0)
    .sort((a, b) => a.pos - b.pos || b.highlight.substring.length - a.highlight.substring.length);

  if (!valid.length) return [{ kind: 'plain', text }];

  const segments: Segment[] = [];
  let cursor = 0;
  for (const item of valid) {
    const pos = text.indexOf(item.highlight.substring, cursor);
    if (pos < 0) continue;
    if (pos > cursor) {
      segments.push({ kind: 'plain', text: text.slice(cursor, pos) });
    }
    segments.push({
      kind: 'highlight',
      text: item.highlight.substring,
      highlight: item.highlight,
      index: item.index,
    });
    cursor = pos + item.highlight.substring.length;
  }
  if (cursor < text.length) {
    segments.push({ kind: 'plain', text: text.slice(cursor) });
  }
  return segments;
}

export default function ImprovedAnswerCard({
  improvedResponse,
  highlights = [],
  ttsKind,
  ttsId,
  heading = 'Your answer, improved',
}: {
  improvedResponse: string;
  highlights?: ImprovedHighlight[];
  ttsKind?: 'attempt' | 'take';
  ttsId?: string | null;
  heading?: string;
}) {
  const cappedHighlights = highlights.slice(0, 3);
  const [activeIndex, setActiveIndex] = useState<number | null>(
    cappedHighlights.length > 0 ? 0 : null,
  );
  const [playing, setPlaying] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'audio' | 'web-speech'>('web-speech');

  const segments = segmentImprovedText(improvedResponse, cappedHighlights);
  const activeHighlight =
    activeIndex !== null ? cappedHighlights[activeIndex] ?? null : null;
  const cacheKey = `${ttsKind ?? 'inline'}:${ttsId ?? improvedResponse.slice(0, 80)}`;

  async function handleToggleAudio() {
    if (playing) {
      stopActiveAudio();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    const mode = await playImprovedAnswerTts({
      cacheKey,
      text: improvedResponse,
      kind: ttsKind,
      id: ttsId,
      onEnd: () => setPlaying(false),
    });
    setVoiceMode(mode);
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4"
      data-testid="improved-answer-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-indigo-950">{heading}</h4>
          <p className="text-sm text-stone-600">
            {cappedHighlights.length > 0
              ? 'Tap a highlighted change to see the reason.'
              : 'Your own ideas in natural B1 English.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleToggleAudio()}
            aria-describedby={voiceMode === 'web-speech' ? 'improved-tts-computer-voice' : undefined}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
          >
            {playing ? (
              <>
                <Square className="h-4 w-4" />
                <span>Stop audio</span>
              </>
            ) : (
              <>
                <Volume2 className="h-4 w-4" />
                <span>Listen</span>
              </>
            )}
          </button>
          {voiceMode === 'web-speech' && (
            <span
              id="improved-tts-computer-voice"
              className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600"
            >
              Computer voice
            </span>
          )}
        </div>
      </div>

      <p className="rounded-lg border border-indigo-100 bg-white p-3.5 text-sm leading-7 text-stone-900">
        {segments.map((seg, i) =>
          seg.kind === 'plain' ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() =>
                setActiveIndex((prev) => (prev === seg.index ? null : seg.index))
              }
              aria-expanded={activeIndex === seg.index}
              className={`inline rounded px-1 py-0.5 text-left font-medium underline decoration-indigo-500 decoration-2 underline-offset-2 transition ${
                activeIndex === seg.index
                  ? 'bg-indigo-200 text-indigo-950'
                  : 'bg-amber-100 text-stone-900 hover:bg-amber-200'
              }`}
            >
              {seg.text}
            </button>
          ),
        )}
      </p>

      {activeHighlight && (
        <div
          role="region"
          aria-label="Highlighted change reason"
          className="rounded-lg border border-indigo-200 bg-white p-3 text-sm text-stone-800"
        >
          {activeHighlight.before && (
            <p className="text-stone-600">
              <strong>Changed from:</strong> &ldquo;{activeHighlight.before}&rdquo;
            </p>
          )}
          <p className="font-semibold text-indigo-900">
            {activeHighlight.label}: &ldquo;{activeHighlight.substring}&rdquo;
          </p>
          <p className="mt-1 text-stone-700">{activeHighlight.explanation}</p>
        </div>
      )}
    </div>
  );
}
