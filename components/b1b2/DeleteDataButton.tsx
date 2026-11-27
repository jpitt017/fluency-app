'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { clearGrammarPositions } from '@/lib/curriculum/grammar-practice-position.mjs';

export default function DeleteDataButton({ userId }: { userId: string | null }) {
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
      // Persist the signed receipt before asking the server to remove files.
      // If the final response is lost, the same receipt safely checks the same
      // job on retry instead of deleting any new work a second time.
      if (!userId) throw new Error('Sign in required.');
      const receiptKey = `learning-data-deletion:${userId}`;
      let receipt = window.localStorage.getItem(receiptKey);
      if (!receipt) {
        const begin = await fetch('/api/account/delete-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: 'DELETE', phase: 'begin' }),
        });
        const data = (await begin.json().catch(() => null)) as { error?: string; pending?: boolean; receipt?: string } | null;
        if (!begin.ok || !data?.pending || !data.receipt) {
          setStatus(data?.error || 'We could not start deleting your data. Please try again.');
          return;
        }
        receipt = data.receipt;
        // If browser storage is disabled, stop before any files are removed.
        window.localStorage.setItem(receiptKey, receipt);
      }
      const res = await fetch('/api/account/delete-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE', phase: 'finish', receipt }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; code?: string; deleted?: boolean; alreadyCompleted?: boolean } | null;
      if (!res.ok || !data?.deleted) {
        if (data?.code === 'stale_receipt') {
          // A key rotation or a different job makes this receipt unusable.
          // Do not automatically start a new destructive request: the learner
          // must explicitly confirm again after seeing the explanation.
          try { window.localStorage.removeItem(receiptKey); } catch { /* allow retry if storage recovers */ }
          setStatus('This saved request could not be verified. Confirm again to start or resume deletion of your current data.');
        } else {
          setStatus(data?.error || 'Deletion is pending. Some files may already be gone. Please try again.');
        }
        return;
      }
      if (!data.alreadyCompleted) {
        try {
          clearGrammarPositions(window.localStorage, userId);
        } catch {
          // Server deletion is complete even if browser storage is unavailable.
        }
      }
      try { window.localStorage.removeItem(receiptKey); } catch { /* same */ }
      setStatus(data.alreadyCompleted
        ? 'Your earlier deletion is complete. Data created afterwards was not deleted; start a new request if you want to erase it.'
        : 'Your learning data and recordings have been deleted.');
      setConfirming(false);
      setTyped('');
      router.refresh();
    } catch (err) {
      console.error('[delete-data] request failed:', err);
      setStatus('Deletion could not finish. Some files may already be gone. Please try again.');
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
            This permanently erases your lessons, SRS decks, AI feedback logs, error cards, and voice recordings (your login account &amp; Stripe billing remain active unless cancelled separately). Type{' '}
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
              disabled={busy}
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
