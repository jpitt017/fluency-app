'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function IssueStatus({ id, status }: { id: string; status: string }) {
  const [value, setValue] = useState(status);
  const [message, setMessage] = useState('');
  const router = useRouter();
  async function change(next: string) {
    const { error } = await createClient().from('issue_reports').update({ status: next }).eq('id', id);
    if (error) { setMessage('Could not save. Please try again.'); return; }
    setValue(next); setMessage('Saved.'); router.refresh();
  }
  return <label className="text-sm font-semibold">Status <select value={value} onChange={e => void change(e.target.value)} className="ml-2 rounded border p-1">
    {['New', 'Investigating', 'Fixed', "Won't fix"].map(s => <option key={s}>{s}</option>)}
  </select><span role="status" className="ml-2 text-xs">{message}</span></label>;
}
