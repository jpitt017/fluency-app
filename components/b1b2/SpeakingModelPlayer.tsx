'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AudioTransportControls, { formatClock } from './AudioTransportControls';
import { pickVoiceForLang } from '@/lib/b1b2/speech';

function estimatedSpeechSeconds(text: string, rate: number) {
  return Math.max(1, text.length / (14 * rate));
}

function wordStart(text: string, index: number) {
  let next = Math.min(Math.max(index, 0), text.length);
  while (next < text.length && !/\s/.test(text[next])) next += 1;
  while (next < text.length && /\s/.test(text[next])) next += 1;
  return next;
}

export default function SpeakingModelPlayer({ text, audioUrl }: { text: string; audioUrl: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechOffsetRef = useRef(0);
  const speechRunRef = useRef(0);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [seconds, setSeconds] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const useSpeech = !audioUrl || failed;
  const duration = useSpeech ? estimatedSpeechSeconds(text, rate) : audioDuration;

  useEffect(() => {
    if (!useSpeech && audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate, useSpeech]);

  useEffect(() => () => {
    speechRunRef.current += 1;
    window.speechSynthesis?.cancel();
  }, []);

  const speakFrom = useCallback((offset: number, speechRate = rate) => {
    if (!('speechSynthesis' in window)) {
      setAnnouncement('Speech playback is not supported in this browser.');
      setPlaying(false);
      return;
    }
    const run = ++speechRunRef.current;
    const synth = window.speechSynthesis;
    synth.cancel();
    const start = wordStart(text, offset);
    speechOffsetRef.current = start;
    const utterance = new SpeechSynthesisUtterance(text.slice(start));
    utterance.lang = 'en-GB';
    utterance.rate = speechRate;
    const voice = pickVoiceForLang(synth.getVoices().filter((item) => item.lang.toLowerCase().startsWith('en')), 'en-GB');
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      if (speechRunRef.current !== run) return;
      setPlaying(true);
      setAnnouncement('Playing');
    };
    utterance.onboundary = (event) => {
      if (speechRunRef.current !== run || !Number.isFinite(event.charIndex)) return;
      const position = Math.min(text.length, start + event.charIndex);
      speechOffsetRef.current = position;
      setSeconds(estimatedSpeechSeconds(text, speechRate) * position / Math.max(text.length, 1));
    };
    utterance.onend = () => {
      if (speechRunRef.current !== run) return;
      setPlaying(false);
      speechOffsetRef.current = 0;
      setSeconds(estimatedSpeechSeconds(text, speechRate));
      setAnnouncement('Finished');
    };
    utterance.onerror = () => {
      if (speechRunRef.current !== run) return;
      setPlaying(false);
      setAnnouncement('Speech playback stopped.');
    };
    utteranceRef.current = utterance;
    synth.speak(utterance);
  }, [rate, text]);

  const toggle = useCallback(() => {
    if (!useSpeech) {
      const audio = audioRef.current;
      if (!audio) return;
      if (playing) audio.pause();
      else {
        if (audio.ended) audio.currentTime = 0;
        void audio.play();
      }
      return;
    }
    const synth = window.speechSynthesis;
    if (playing) {
      synth.pause();
      setPlaying(false);
      setAnnouncement('Paused');
    } else if (synth.paused && utteranceRef.current) {
      synth.resume();
      setPlaying(true);
      setAnnouncement('Playing');
    } else {
      const offset = seconds >= duration ? 0 : speechOffsetRef.current;
      if (seconds >= duration) setSeconds(0);
      speakFrom(offset, rate);
    }
  }, [duration, playing, rate, seconds, speakFrom, useSpeech]);

  const stop = useCallback(() => {
    if (useSpeech) {
      speechRunRef.current += 1;
      window.speechSynthesis?.cancel();
      utteranceRef.current = null;
      speechOffsetRef.current = 0;
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaying(false);
    setSeconds(0);
    setAnnouncement('Stopped');
  }, [useSpeech]);

  const seek = useCallback((to: number) => {
    const next = Math.min(Math.max(to, 0), duration);
    if (!useSpeech && audioRef.current) {
      audioRef.current.currentTime = next;
      setSeconds(next);
      setAnnouncement(`${formatClock(next)} of ${formatClock(duration)}`);
      return;
    }
    const offset = wordStart(text, Math.floor(text.length * next / Math.max(duration, 1)));
    speechOffsetRef.current = offset;
    setSeconds(next);
    setAnnouncement(`About ${formatClock(next)} of ${formatClock(duration)}`);
    if (playing) speakFrom(offset, rate);
  }, [duration, playing, rate, speakFrom, text, useSpeech]);

  const toggleRate = useCallback(() => {
    const nextRate = rate === 0.75 ? 1 : 0.75;
    if (useSpeech) {
      const offset = speechOffsetRef.current;
      setRate(nextRate);
      if (playing) speakFrom(offset, nextRate);
      return;
    }
    setRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  }, [playing, rate, speakFrom, useSpeech]);

  return (
    <div className="space-y-2" data-testid="speaking-model-player">
      {useSpeech ? (
        <p className="text-xs text-amber-800">Temporary computer voice. The position and duration are approximate.</p>
      ) : (
        <audio
          ref={audioRef}
          src={audioUrl ?? undefined}
          preload="metadata"
          onLoadedMetadata={() => {
            if (audioRef.current && Number.isFinite(audioRef.current.duration)) setAudioDuration(audioRef.current.duration);
            if (audioRef.current) audioRef.current.playbackRate = rate;
          }}
          onPlay={() => { setPlaying(true); setAnnouncement('Playing'); }}
          onPause={() => {
            setPlaying(false);
            setAnnouncement(audioRef.current?.currentTime === 0 ? 'Stopped' : 'Paused');
          }}
          onEnded={() => { setPlaying(false); setSeconds(audioDuration); setAnnouncement('Finished'); }}
          onTimeUpdate={() => setSeconds(audioRef.current?.currentTime ?? 0)}
          onError={() => { setFailed(true); setPlaying(false); }}
        />
      )}
      <AudioTransportControls
        id="speaking-model-seek"
        positionLabel={useSpeech ? 'Approximate position in the speaking model' : 'Position in the speaking model'}
        seconds={seconds}
        duration={duration}
        playing={playing}
        rate={rate}
        playLabel="Play model"
        tone="indigo"
        onToggle={toggle}
        onStop={stop}
        onSeek={seek}
        onToggleRate={toggleRate}
      />
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}
