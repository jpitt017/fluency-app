'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

export default function DeleteDataButton() {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const router = useRouter();

  async function handleDelete() {
    if (typed.trim() !== 'DELETE') return;
    setBusy(true);
    setStatus('');
    try {
      const res = await fetch('/api/account/delete-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; removedAudioFiles?: number };
      if (!res.ok) throw new Error(data.error ?? 'Could not erase learning data.');
      setStatus(`All learning data and ${data.removedAudioFiles ?? 0} audio recordings deleted.`);
      setConfirming(false);
      setTyped('');
      router.refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Deletion failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2.5">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Delete my learning data &amp; recordings</span>
        </button>
      ) : (
        <div className="rounded-xl border border-rose-300 bg-rose-50/70 p-3.5 text-xs">
          <p className="font-semibold text-rose-950">
            This permanently erases your lessons, SRS decks, AI feedback logs, error cards, and voice recordings. Type{' '}
            <code className="rounded bg-white px-1 py-0.5 font-mono">DELETE</code> to confirm:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="DELETE"
              className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-mono text-stone-900"
            />
            <button
              type="button"
              disabled={busy || typed.trim() !== 'DELETE'}
              onClick={() => void handleDelete()}
              className="rounded-lg bg-rose-700 px-3 py-1.5 font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
            >
              {busy ? 'Deleting…' : 'Confirm erasure'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setTyped('');
              }}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-semibold text-stone-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {status && <p className="text-xs font-medium text-stone-700">{status}</p>}
    </div>
  );
}
