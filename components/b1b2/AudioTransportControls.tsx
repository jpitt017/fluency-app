'use client';

import { useCallback } from 'react';
import { formatClock as formatTime } from '@/lib/curriculum/week-input-ui.mjs';

/** Shared with the small replay player; the name stays for the speaking player. */
export const formatClock: (seconds: number) => string = formatTime;

type Props = {
  id: string;
  positionLabel: string;
  seconds: number;
  duration: number;
  playing: boolean;
  rate: number;
  playLabel: string;
  tone?: 'amber' | 'indigo';
  onToggle(): void;
  onStop(): void;
  onSeek(to: number): void;
  onToggleRate(): void;
};

const SKIP_SECONDS = 5;

/** Shared, keyboard-operable transport controls for listening and speaking audio. */
export default function AudioTransportControls({
  id,
  positionLabel,
  seconds,
  duration,
  playing,
  rate,
  playLabel,
  tone = 'amber',
  onToggle,
  onStop,
  onSeek,
  onToggleRate,
}: Props) {
  const skip = useCallback((offset: number) => {
    onSeek(seconds + offset);
  }, [onSeek, seconds]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, a, select, textarea') && (event.key === ' ' || event.key === 'Enter')) return;
    // Let the range input use its native arrow-key increments when it has focus.
    if (target instanceof HTMLInputElement && target.type === 'range' && event.key.startsWith('Arrow')) return;
    if (event.key === ' ') {
      event.preventDefault();
      onToggle();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      skip(-SKIP_SECONDS);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      skip(SKIP_SECONDS);
    }
  }, [onToggle, skip]);

  const colors = tone === 'amber'
    ? { play: 'bg-amber-900 text-white', control: 'bg-white text-amber-900 ring-amber-300', range: 'accent-amber-900', text: 'text-amber-900/80' }
    : { play: 'bg-indigo-800 text-white', control: 'bg-white text-indigo-900 ring-indigo-300', range: 'accent-indigo-800', text: 'text-stone-700' };
  const max = Math.max(duration, 1);
  const value = Math.min(Math.max(seconds, 0), max);
  const progress = duration > 0 ? Math.min(100, (value / duration) * 100) : 0;

  return (
    <div className="space-y-2" onKeyDown={onKeyDown} data-testid="audio-transport-controls">
      <div className="space-y-1">
        <label htmlFor={id} className="sr-only">{positionLabel}</label>
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-valuetext={`${formatClock(value)} of ${formatClock(duration)}`}
          className={`h-3 w-full cursor-pointer ${colors.range}`}
          style={{ backgroundSize: `${progress}% 100%` }}
        />
        <p className={`text-sm tabular-nums ${colors.text}`} aria-hidden="true">
          {formatClock(value)} / {formatClock(duration)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => skip(-SKIP_SECONDS)}
          aria-label={`Back ${SKIP_SECONDS} seconds`}
          className={`min-h-11 min-w-11 rounded-xl px-3 py-2 font-semibold ring-1 ${colors.control}`}
        >
          ⟲ {SKIP_SECONDS} s
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={playing}
          className={`min-h-11 min-w-11 rounded-xl px-6 py-2 font-semibold ${colors.play}`}
        >
          {playing ? 'Pause' : playLabel}
        </button>
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop playback"
          className={`min-h-11 min-w-11 rounded-xl px-3 py-2 font-semibold ring-1 ${colors.control}`}
        >
          Stop
        </button>
        <button
          type="button"
          onClick={() => skip(SKIP_SECONDS)}
          aria-label={`Forward ${SKIP_SECONDS} seconds`}
          className={`min-h-11 min-w-11 rounded-xl px-3 py-2 font-semibold ring-1 ${colors.control}`}
        >
          {SKIP_SECONDS} s ⟳
        </button>
        <button
          type="button"
          onClick={onToggleRate}
          aria-pressed={rate === 0.75}
          aria-label="Slower speed, three quarters"
          className={`min-h-11 min-w-11 rounded-xl px-3 py-2 font-semibold ring-1 ${colors.control}`}
        >
          {rate === 0.75 ? '0.75×' : '1×'}
        </button>
      </div>
    </div>
  );
}
