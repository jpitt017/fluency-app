'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckSquare, Headphones, Mic, Play, RotateCcw, Square, Volume2 } from 'lucide-react';
import { resolveAudioUrl } from '@/lib/b1b2/audio';
import { playAudioOrSpeak, speakPhrase, stopActiveAudio } from '@/lib/b1b2/speech';

export interface ShadowingTarget {
  label: string;
  text: string;
  audioUrl?: string | null;
  note?: string;
}

const DEFAULT_CHECKLIST = [
  { id: 'stress', label: 'I said the important words more strongly.' },
  { id: 'linking', label: 'I joined words together, like turn_it_on.' },
  { id: 'intonation', label: "My voice went up and down like the speaker's." },
  { id: 'pace', label: 'I spoke smoothly, without long stops.' },
];

export default function ShadowingLab({
  targets,
  title = 'Pronunciation practice',
  pronunciationFocus,
}: {
  targets: ShadowingTarget[];
  title?: string;
  pronunciationFocus?: string;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [rate, setRate] = useState<0.85 | 1>(1);
  const [playingModel, setPlayingModel] = useState(false);
  const [modelPlayCount, setModelPlayCount] = useState(0);
  const [selfReplayCount, setSelfReplayCount] = useState(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [modelAudioFailed, setModelAudioFailed] = useState(false);
  const [recordedAudioFailed, setRecordedAudioFailed] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const safeTargets =
    targets.length > 0
      ? targets
      : [
          {
            label: 'Model B1 → B2 sentence',
            text: 'Having lived abroad for two years, I realised how much my perspective had changed.',
            note: 'Focus on linking "lived abroad" and stress on "realised" and "perspective".',
          },
        ];
  const active = safeTargets[Math.min(selectedIdx, safeTargets.length - 1)];
  const resolvedAudioUrl = resolveAudioUrl(active.audioUrl);
  const useTemporaryVoice = !resolvedAudioUrl || modelAudioFailed;

  useEffect(() => {
    return () => {
      stopActiveAudio();
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      void audioCtxRef.current?.close();
    };
  }, []);

  function drawBars(values: number[], color: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    const barCount = values.length || 1;
    const barWidth = Math.max(2, Math.floor(width / barCount) - 2);
    const step = width / barCount;

    ctx.fillStyle = color;
    values.forEach((amp, idx) => {
      const h = Math.max(4, amp * (height - 8));
      const x = idx * step + 1;
      const y = (height - h) / 2;
      ctx.fillRect(x, y, barWidth, h);
    });
  }

  async function renderRecordedWaveform(blob: Blob) {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      const data = buffer.getChannelData(0);
      const bars = 48;
      const blockSize = Math.max(1, Math.floor(data.length / bars));
      const amps: number[] = [];
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        const start = i * blockSize;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(data[start + j] || 0);
        }
        amps.push(Math.min(1, (sum / blockSize) * 3.2));
      }
      drawBars(amps, '#be123c');
      await ctx.close();
    } catch {
      /* Ignore waveform decode errors in unsupported environments */
    }
  }

  async function playModel() {
    setError('');
    setPlayingModel(true);
    setModelPlayCount((n) => n + 1);
    try {
      if (useTemporaryVoice) {
        await speakPhrase(active.text, 'en-GB', rate);
      } else {
        const played = await playAudioOrSpeak(resolvedAudioUrl, active.text, 'en-GB', rate);
        // If the recording fails and speech synthesis is used, label that
        // fallback immediately rather than presenting it as the recording.
        if (played === 'tts') setModelAudioFailed(true);
      }
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
        if (animFrameRef.current !== null) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecordedUrl(URL.createObjectURL(blob));
        void renderRecordedWaveform(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      // Live microphone waveform preview
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const audioCtx = new Ctx();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        const freq = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(freq);
          const norm = Array.from(freq.slice(0, 32)).map((v) => v / 255);
          drawBars(norm, '#4338ca');
          animFrameRef.current = requestAnimationFrame(tick);
        };
        animFrameRef.current = requestAnimationFrame(tick);
      }

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

  function toggleChecklist(id: string) {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const completedChecks = DEFAULT_CHECKLIST.filter((c) => checkedItems[c.id]).length;

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
              Listen to the sentence. Say it at the same time as the speaker. Then record yourself and compare.
            </p>
            {pronunciationFocus && (
              <p className="mt-1 text-[11px] font-semibold text-emerald-800">
                Pronunciation tip: {pronunciationFocus}
              </p>
            )}
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
                setModelAudioFailed(false);
                setRecordedAudioFailed(false);
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
            aria-describedby={useTemporaryVoice ? 'shadowing-temporary-voice' : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800"
          >
            {playingModel ? <Volume2 className="h-3.5 w-3.5" /> : <Play className="h-3 w-3 fill-current" />}
            <span>Listen to the sentence</span>
          </button>

          {!recording ? (
            <button
              type="button"
              onClick={startShadowing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
            >
              <Mic className="h-3.5 w-3.5 text-rose-700" />
              <span>{recordedUrl ? 'Record again' : 'Record yourself'}</span>
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

          <span className="ml-auto text-[11px] font-medium text-stone-500">
            Speaker plays: {modelPlayCount} · Your plays: {selfReplayCount}
          </span>
        </div>

        {(recording || recordedUrl) && (
          <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-2">
            <canvas ref={canvasRef} width={480} height={44} className="h-11 w-full" />
          </div>
        )}

        {(useTemporaryVoice || recordedUrl) && (
          <div className="mt-3 grid gap-3 border-t border-stone-100 pt-3 sm:grid-cols-2">
            <div className="rounded-lg bg-stone-50 p-2.5">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-indigo-800">
                1. The speaker
              </p>
              {useTemporaryVoice ? (
                <>
                  <button
                    type="button"
                    onClick={() => void speakPhrase(active.text, 'en-GB', rate)}
                    className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                  >
                    Listen again ({rate}×)
                  </button>
                  <p id="shadowing-temporary-voice" className="mt-1 text-[10px] font-semibold text-amber-700">Temporary computer voice</p>
                </>
              ) : (
                <audio
                  controls
                  src={resolvedAudioUrl ?? undefined}
                  onPlay={() => setModelPlayCount((n) => n + 1)}
                  onError={() => {
                    setModelAudioFailed(true);
                    void speakPhrase(active.text, 'en-GB', rate);
                  }}
                  className="h-8 w-full"
                />
              )}
            </div>
            <div className="rounded-lg bg-stone-50 p-2.5">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-rose-800">
                2. Your recording
              </p>
              {recordedUrl && !recordedAudioFailed ? (
                <audio
                  controls
                  src={recordedUrl}
                  onPlay={() => setSelfReplayCount((n) => n + 1)}
                  onError={() => setRecordedAudioFailed(true)}
                  className="h-8 w-full"
                />
              ) : recordedUrl ? (
                <div>
                  <button
                    type="button"
                    onClick={() => void speakPhrase(active.text, 'en-GB', rate)}
                    className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                  >
                    Listen to the sentence
                  </button>
                  <p className="mt-1 text-[10px] font-semibold text-amber-700">Temporary computer voice</p>
                </div>
              ) : (
                <p className="text-xs text-stone-500">Record yourself, then listen to both.</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 border-t border-stone-100 pt-3">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-stone-600">
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="h-3.5 w-3.5 text-indigo-700" />
              <span>Check your pronunciation</span>
            </span>
            <span>
              {completedChecks}/{DEFAULT_CHECKLIST.length} checked
            </span>
          </div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {DEFAULT_CHECKLIST.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs text-stone-700 hover:bg-stone-100"
              >
                <input
                  type="checkbox"
                  checked={Boolean(checkedItems[item.id])}
                  onChange={() => toggleChecklist(item.id)}
                  className="mt-0.5 accent-indigo-700"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
