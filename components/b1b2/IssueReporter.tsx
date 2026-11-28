'use client';

import { useEffect, useRef, useState } from 'react';
import { browserDeletionGeneration, DELETION_EPOCH_HEADER } from '@/lib/b1b2/deletion-epoch.mjs';

type Recorder = { stream: MediaStream; context: AudioContext; processor: ScriptProcessorNode; source: MediaStreamAudioSourceNode; chunks: Float32Array[]; samples: number; timer: ReturnType<typeof setTimeout> };

function wavFile(chunks: Float32Array[], samples: number, rate: number): Blob {
  const input = new Float32Array(samples);
  let offset = 0;
  for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length; }
  const count = Math.min(960000, Math.floor(input.length * 16000 / rate));
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const put = (pos: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(pos + i, value.charCodeAt(i)); };
  put(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); put(8, 'WAVE'); put(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  put(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const value = Math.max(-1, Math.min(1, input[Math.floor(i * rate / 16000)]));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export default function IssueReporter({ signedIn, isStaff = false }: { signedIn: boolean; isStaff?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const recorder = useRef<Recorder | null>(null);
  const reportEpoch = useRef('missing');
  const [type, setType] = useState('broken');
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [text, setText] = useState('');
  const [audio, setAudio] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [include, setInclude] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  function finishRecording(save = true) {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null; clearTimeout(r.timer);
    r.processor.disconnect(); r.source.disconnect(); r.stream.getTracks().forEach(track => track.stop());
    void r.context.close();
    setRecording(false);
    if (save && r.samples) setAudio(wavFile(r.chunks, r.samples, r.context.sampleRate));
  }
  useEffect(() => () => {
    const r = recorder.current;
    if (r) { clearTimeout(r.timer); r.processor.disconnect(); r.source.disconnect(); r.stream.getTracks().forEach(track => track.stop()); void r.context.close(); }
  }, []);

  async function startRecording() {
    setError(''); setAudio(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const r: Recorder = { stream, context, source, processor, chunks: [], samples: 0, timer: setTimeout(() => finishRecording(), 60000) };
      recorder.current = r;
      processor.onaudioprocess = event => {
        const remaining = Math.max(0, Math.floor(context.sampleRate * 60) - r.samples);
        const chunk = new Float32Array(event.inputBuffer.getChannelData(0).subarray(0, remaining));
        r.chunks.push(chunk); r.samples += chunk.length;
        if (!remaining || r.samples >= context.sampleRate * 60) finishRecording();
      };
      source.connect(processor); processor.connect(context.destination); setRecording(true);
    } catch { setError('Could not use your microphone. Please check your settings.'); }
  }
  function close() { if (busy) return; finishRecording(false); dialog.current?.close(); }
  async function send(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const form = new FormData(); form.set('type', type); form.set('mode', mode);
      if (mode === 'text') form.set('message', text);
      if (mode === 'voice' && audio) form.set('audio', audio, 'report.wav');
      if (screenshot) form.set('screenshot', screenshot);
      form.set('includeLastAnswer', String(include));
      form.set('page', window.location.origin + window.location.pathname);
      form.set('browser', navigator.userAgent);
      form.set('device', navigator.platform || 'unknown');
      form.set('screen', `${window.screen.width} × ${window.screen.height}`);
      const res = await fetch('/api/issues', { method: 'POST', headers: { [DELETION_EPOCH_HEADER]: reportEpoch.current }, body: form });
      const result = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok || !result) {
        console.error('[issues] report failed:', result?.error ?? res.status);
        setError(result?.error || (isStaff ? 'Could not send. Please try again.' : 'Something went wrong. Please try again, or message your teacher.'));
        return;
      }
      setSent(true); setText(''); setAudio(null); setScreenshot(null); setInclude(false);
    } catch (e) {
      console.error('[issues] report failed:', e);
      setError(isStaff ? (e instanceof Error ? e.message : 'Could not send. Please try again.') : 'Something went wrong. Please try again, or message your teacher.');
    }
    finally { setBusy(false); }
  }
  return <>
    {/* On phones and small tablets a floating pill at the bottom-right sits directly
        on top of full-width primary actions (it blocked "Continue to Writing Sample →"
        at the end of the placement quiz), so below `sm` the launcher docks into the
        footer instead of floating. From `sm` up it is a compact pill that stays clear
        of page actions, which reserve the bottom-right corner with `pb-24`. */}
    <div className="mx-auto flex w-full max-w-6xl justify-end px-4 pb-2 sm:pointer-events-none sm:fixed sm:inset-x-0 sm:bottom-4 sm:z-40 sm:px-6 sm:pb-0">
      <button type="button" onClick={() => { reportEpoch.current = browserDeletionGeneration(); setSent(false); setError(''); dialog.current?.showModal(); }} className="pointer-events-auto rounded-full bg-indigo-700 px-4 py-2.5 text-xs font-semibold leading-5 text-white shadow-lg hover:bg-indigo-800">Problem? Tell us</button>
    </div>
    <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else finishRecording(false); }} className="m-auto max-h-[90vh] w-[min(32rem,calc(100%-2rem))] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl backdrop:bg-black/50">
      <div className="flex justify-between gap-4"><h2 className="text-xl font-bold">Tell us about a problem</h2><button type="button" onClick={close} aria-label="Close" disabled={busy}>✕</button></div>
      {sent ? <div className="mt-5 space-y-4"><p>Thank you! We&apos;ll look at this soon.</p><button type="button" onClick={close} className="rounded-lg bg-indigo-700 px-4 py-2 text-white">Close</button></div> : !signedIn ? <div className="mt-5"><p>Please sign in to send a report.</p><a href="/login" className="mt-3 inline-block font-semibold text-indigo-700 underline">Sign in</a></div> : <form onSubmit={send} className="mt-4 space-y-4">
        <label className="block text-sm font-semibold">What would you like to tell us?<select value={type} onChange={e => setType(e.target.value)} className="mt-1 block w-full rounded-lg border p-2">
          <option value="broken">Something is broken</option><option value="unclear">I don&apos;t understand</option><option value="feedback">The feedback is wrong</option><option value="idea">An idea</option>
        </select></label>
        <fieldset><legend className="text-sm font-semibold">How would you like to tell us?</legend><div className="mt-2 flex gap-4">
          <label><input type="radio" checked={mode === 'text'} onChange={() => { finishRecording(false); setMode('text'); }} /> Write</label>
          <label><input type="radio" checked={mode === 'voice'} onChange={() => setMode('voice')} /> Record</label>
        </div></fieldset>
        {mode === 'text' ? <label className="block text-sm font-semibold">Tell us what happened<textarea required maxLength={4000} value={text} onChange={e => setText(e.target.value)} className="mt-1 block min-h-28 w-full rounded-lg border p-2 font-normal" /></label> : <div className="space-y-2"><p className="text-sm">Speak for up to 60 seconds.</p>
          {recording ? <button type="button" onClick={() => finishRecording()} className="rounded-lg border px-3 py-2">Stop recording</button> : <button type="button" onClick={startRecording} className="rounded-lg border px-3 py-2">{audio ? 'Record again' : 'Start recording'}</button>}
          {audio && <p className="text-sm text-emerald-700">Your recording is ready.</p>}
        </div>}
        <label className="block text-sm font-semibold">Add a screenshot (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setScreenshot(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm font-normal" /></label>
        <p className="text-xs text-stone-600">Please hide private information in your screenshot. Do not include your answer unless you tick the box.</p>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={include} onChange={e => setInclude(e.target.checked)} /> Include my last answer</label>
        <p className="text-xs text-stone-600">We only include your latest saved writing or speaking text if you tick this.</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy || recording || (mode === 'voice' && !audio)} className="rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send report'}</button>
      </form>}
    </dialog>
  </>;
}
