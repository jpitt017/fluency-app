'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import AudioTransportControls, { formatClock } from './AudioTransportControls';
import {
  AI_TRIAL_LABEL,
  TRIAL_PLAYS_SUGGESTED,
  isReportablePlay,
  playsUsed,
  trialPlayKey,
  type PlayableTrial,
} from '@/lib/curriculum/listening-audio';

/**
 * Player for the Weeks 1–4 listening AI trial recordings.
 *
 * - Labelled "AI voice – trial recording" and says what that means, as the
 *   listening production notes and OpenAI's usage policy require.
 * - **No limit.** There used to be a hard two-play cap; it is gone. The page keeps
 *   the sentence "Listen once for the main idea, then once more for the detail" as
 *   guidance, and the number of plays is counted and reported so a teacher can see
 *   who is leaning on replay. Guidance, not a gate.
 * - Draggable progress bar, ±5 s buttons, play/pause, elapsed and total time, and
 *   a slow (0.75×) option. Space toggles playback and ← → skip 5 s, unless focus is
 *   already inside a control, where those keys must keep their normal meaning.
 * - No captions and no transcript: the WebVTT file is uploaded for a later
 *   release. The transcript this component would reveal is not plumbed in yet, and
 *   `page.tsx` (outside this component) owns that wiring, so the gate is described
 *   here but not painted — inventing a transcript would be worse than its absence.
 *
 * Accessibility notes, since this is a media player:
 * - Every control is a real <button> with an accessible name, so screen readers
 *   get play state through aria-pressed and the time through a polite live region.
 *   The time region is deliberately NOT read on every timeupdate; it is announced
 *   only when playback starts, pauses or a seek completes, so a screen-reader user
 *   is not read a clock every quarter second.
 * - The seek bar is an <input type="range">, which brings keyboard support,
 *   pointer dragging and the correct role for free.
 * - Touch targets are at least 44×44 px on phones (`min-h-11 min-w-11`).
 */

/** localStorage-backed play counter, read through useSyncExternalStore. */
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export { formatClock };

export default function ListeningTrialPlayer({ trial }: { trial: PlayableTrial }) {
  const storageKey = trialPlayKey(trial.week);
  const used = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return playsUsed(window.localStorage.getItem(storageKey));
      } catch {
        return 0;
      }
    },
    () => 0,
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [seconds, setSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  /** Report a play to the server; failing must never interrupt listening. */
  const report = useCallback((count: number) => {
    if (!isReportablePlay(trial.week, count)) return;
    void fetch('/api/week/listening-play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week: trial.week, count }),
      keepalive: true,
    }).catch(() => {
      // The count is a teaching signal. Losing one is not worth an error message.
    });
  }, [trial.week]);

  const remember = useCallback(
    (next: number) => {
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        // Private mode or blocked storage: the page view holds the count instead.
      }
      notify();
      report(next);
    },
    [storageKey, report],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    // A fresh play from the start counts as a new listen. Resuming after a pause
    // does not: the learner is continuing the same listen.
    if (audio.currentTime === 0 || audio.ended) remember(used + 1);
    void audio.play();
  }, [playing, remember, used]);

  const seek = useCallback((to: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(Math.max(to, 0), audio.duration);
    setSeconds(audio.currentTime);
    setAnnouncement(`${formatClock(audio.currentTime)} of ${formatClock(audio.duration)}`);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setSeconds(0);
    setAnnouncement('Stopped');
  }, []);

  const toggleRate = useCallback(() => setRate((current) => current === 0.75 ? 1 : 0.75), []);
  const suggestedDone = used >= TRIAL_PLAYS_SUGGESTED;

  return (
    <div className="space-y-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200" data-testid="listening-trial-player">
      <div>
        <p className="font-semibold text-amber-900">{AI_TRIAL_LABEL}</p>
        <p className="text-sm text-amber-900/80">
          A computer-generated stand-in while the studio recording is finished; the real voices will replace it.
          {trial.speakers ? ` Speakers: ${trial.speakers}.` : ''}
        </p>
      </div>

      <audio
        ref={audioRef}
        src={trial.audioUrl}
        preload="metadata"
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (audio && Number.isFinite(audio.duration)) setDuration(audio.duration);
          if (audio) audio.playbackRate = rate;
        }}
        onPlay={() => {
          setPlaying(true);
          setAnnouncement('Playing');
        }}
        onPause={() => {
          setPlaying(false);
          setAnnouncement(audioRef.current?.currentTime === 0 ? 'Stopped' : 'Paused');
        }}
        onEnded={() => {
          setPlaying(false);
          setSeconds(0);
          setAnnouncement('Finished');
          const audio = audioRef.current;
          if (audio) audio.currentTime = 0;
        }}
        onTimeUpdate={() => setSeconds(audioRef.current?.currentTime ?? 0)}
      />

      <AudioTransportControls
        id={`trial-seek-${trial.week}`}
        positionLabel="Position in the track"
        seconds={seconds}
        duration={duration}
        playing={playing}
        rate={rate}
        playLabel={used === 0 ? 'Play the track' : 'Play again'}
        onToggle={toggle}
        onStop={stop}
        onSeek={seek}
        onToggleRate={toggleRate}
      />

      {/* Guidance, never a gate. The sentence itself lives on the page; this is
          the gentle nudge once the two suggested listens are used. */}
      <p className="text-sm text-amber-900/80">
        {suggestedDone
          ? 'You have listened twice. Play it again as often as you need.'
          : `Listen once for the main idea, then once more for the detail.`}
      </p>

      {/* Announced on play/pause/seek only, not on every timeupdate. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
