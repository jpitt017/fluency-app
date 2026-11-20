'use client';

import { useEffect, useRef, useState } from 'react';
import { Headphones, Mic, Play, RotateCcw, Square, Volume2 } from 'lucide-react';
import { playAudioOrSpeak, stopActiveAudio } from '@/lib/b1b2/speech';

export interface ShadowingTarget {
  label: string;
  text: string;
  audioUrl?: string | null;
  note?: string;
}

export default function ShadowingLab({
  targets,
  title = 'Listen-and-Compare Shadowing Lab',
}: {
  targets: ShadowingTarget[];
  title?: string;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [rate, setRate] = useState<0.85 | 1>(1);
  const [playingModel, setPlayingModel] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const safeTargets = targets.length > 0 ? targets : [
    {
      label: 'Model B1 → B2 sentence',
      text: 'Having lived abroad for two years, I realised how much my perspective had changed.',
      note: 'Focus on linking "lived abroad" and stress on "realised" and "perspective".',
    },
  ];
  const active = safeTargets[Math.min(selectedIdx, safeTargets.length - 1)];

  useEffect(() => {
    return () => {
      stopActiveAudio();
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

  async function playModel() {
    setError('');
    setPlayingModel(true);
    try {
      await playAudioOrSpeak(active.audioUrl, active.text, 'en-GB', rate);
    } finally {
      window.setTimeout(() => setPlayingModel(false), 1200);
    }
  }

  async function startShadowing() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError('Microphone access is unavailable in this browser.');
    }
  }

  function stopShadowing() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <Headphones className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900">{title}</h4>
            <p className="text-[11px] text-stone-500">
              Listen to the model, shadow aloud, then compare your rhythm and stress side by side.
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 text-[11px] font-semibold">
          {([0.85, 1] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRate(s)}
              className={`rounded-md px-2 py-0.5 ${rate === s ? 'bg-indigo-700 text-white' : 'text-stone-600'}`}
            >
              {s === 1 ? '1.0× Natural' : '0.85× Slow'}
            </button>
          ))}
        </div>
      </div>

      {safeTargets.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {safeTargets.map((item, idx) => (
            <button
              key={item.label + idx}
              type="button"
              onClick={() => {
                setSelectedIdx(idx);
                setRecordedUrl(null);
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                idx === selectedIdx
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3.5">
        <p className="text-sm font-medium leading-6 text-stone-900">&ldquo;{active.text}&rdquo;</p>
        {active.note && <p className="mt-1 text-xs text-stone-500">{active.note}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void playModel()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800"
          >
            {playingModel ? <Volume2 className="h-3.5 w-3.5" /> : <Play className="h-3 w-3 fill-current" />}
            <span>{active.audioUrl ? 'Play studio model' : 'Play UK model'}</span>
          </button>

          {!recording ? (
            <button
              type="button"
              onClick={startShadowing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
            >
              <Mic className="h-3.5 w-3.5 text-rose-700" />
              <span>{recordedUrl ? 'Record again' : 'Record your shadow'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopShadowing}
              className="inline-flex animate-pulse items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>Stop ({seconds}s)</span>
            </button>
          )}

          {recordedUrl && (
            <button
              type="button"
              onClick={() => setRecordedUrl(null)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:text-stone-800"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {(active.audioUrl || recordedUrl) && (
          <div className="mt-3 grid gap-3 border-t border-stone-100 pt-3 sm:grid-cols-2">
            <div className="rounded-lg bg-stone-50 p-2.5">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-indigo-800">
                1. Reference Model
              </p>
              {active.audioUrl ? (
                <audio controls src={active.audioUrl} className="h-8 w-full" />
              ) : (
                <button
                  type="button"
                  onClick={() => void playModel()}
                  className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                >
                  Replay UK model ({rate}×)
                </button>
              )}
            </div>
            <div className="rounded-lg bg-stone-50 p-2.5">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-rose-800">
                2. Your Shadowing Take
              </p>
              {recordedUrl ? (
                <audio controls src={recordedUrl} className="h-8 w-full" />
              ) : (
                <p className="text-xs text-stone-500">Record your attempt to compare side by side.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
