'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  AI_TRIAL_LABEL,
  TRIAL_PLAYS_ALLOWED,
  canPlayAgain,
  playsUsed,
  trialPlayKey,
  type PlayableTrial,
} from '@/lib/curriculum/listening-audio';

/**
 * Player for the Weeks 1–4 listening AI trial recordings.
 *
 * - Labelled "AI voice – trial recording" and says what that means, as the
 *   listening production notes and OpenAI's usage policy require.
 * - Playable twice: first listen for the gist task, second for detail. The count
 *   lives in this browser, so it is a learner-facing nudge rather than access
 *   control; the server-side approval flag is what keeps an unreleased track out
 *   of the page at all.
 * - No captions and no transcript: the WebVTT file is uploaded for a later
 *   release, and reading support comes later in the listening task.
 * - Speed control appears from the second listen, per the listening notes.
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

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  const remember = useCallback(
    (next: number) => {
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        // Private mode or blocked storage: the page view holds the count instead.
      }
      notify();
    },
    [storageKey],
  );

  const startListen = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (!canPlayAgain(used)) return;
    if (audio.currentTime === 0) remember(used + 1);
    void audio.play();
  }, [playing, remember, used]);

  const listensLeft = Math.max(0, TRIAL_PLAYS_ALLOWED - used);

  return (
    <div className="space-y-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
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
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setSeconds(0);
          if (audioRef.current) audioRef.current.currentTime = 0;
        }}
        onTimeUpdate={() => setSeconds(audioRef.current?.currentTime ?? 0)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={startListen}
          disabled={!playing && listensLeft === 0}
          className="rounded-xl bg-amber-900 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {playing ? 'Pause' : used === 0 ? 'Play the track' : 'Play again'}
        </button>
        <span className="text-sm text-amber-900/80" aria-live="polite">
          {Math.floor(seconds / 60)}:{String(Math.floor(seconds % 60)).padStart(2, '0')} ·{' '}
          {listensLeft === 0
            ? 'both listens used'
            : `${listensLeft} ${listensLeft === 1 ? 'listen' : 'listens'} left of ${TRIAL_PLAYS_ALLOWED}`}
        </span>
        {used > 0 && (
          <span className="flex items-center gap-1 text-sm text-amber-900/80">
            Speed
            {[0.8, 1].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRate(option)}
                aria-pressed={rate === option}
                className={`rounded-lg px-2 py-1 ${rate === option ? 'bg-amber-900 text-white' : 'bg-white text-amber-900'}`}
              >
                {option.toFixed(1)}×
              </button>
            ))}
          </span>
        )}
      </div>

      {listensLeft === 0 && !playing && (
        <p role="status" className="text-sm text-amber-900">
          You have used both listens for this track. The transcript stays hidden until the real recording replaces this
          trial one.
        </p>
      )}
    </div>
  );
}
