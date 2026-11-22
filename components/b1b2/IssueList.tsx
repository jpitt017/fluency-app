import Link from 'next/link';
import IssueStatus from './IssueStatus';
import { createServerSupabase } from '@/utils/supabase/server';

const typeLabels: Record<string, string> = { broken: 'Something is broken', unclear: "I don't understand", feedback: 'The feedback is wrong', idea: 'An idea' };
const statuses = ['New', 'Investigating', 'Fixed', "Won't fix"];
export default async function IssueList({ type, status }: { type?: string; status?: string }) {
  const client = await createServerSupabase();
  if (!client) return <p>Could not load reports.</p>;
  let query = client.from('issue_reports').select('id,user_id,created_at,type,status,message,page_url,browser,device,screen_size,current_week,app_version,last_answer,audio_path,screenshot_path,email_sent_at').order('created_at', { ascending: false }).limit(100);
  if (type && type in typeLabels) query = query.eq('type', type);
  if (status && statuses.includes(status)) query = query.eq('status', status);
  const { data: issues, error } = await query;
  return <section className="space-y-4">
    <form className="flex flex-wrap gap-3 rounded-xl border bg-white p-4" action="/teacher" method="get"><input type="hidden" name="tab" value="issues" />
      <label>Type <select name="type" defaultValue={type ?? ''} className="rounded border p-2"><option value="">All types</option>{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Status <select name="status" defaultValue={status ?? ''} className="rounded border p-2"><option value="">All statuses</option>{statuses.map(s => <option key={s}>{s}</option>)}</select></label>
      <button className="rounded bg-indigo-700 px-4 py-2 text-white">Filter</button>
    </form>
    {error ? <p>Could not load reports.</p> : !issues?.length ? <p>No reports found.</p> : issues.map(issue => <article key={issue.id} className="space-y-3 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{typeLabels[issue.type] ?? issue.type}</h2><time>{new Date(issue.created_at).toLocaleString()}</time></div>
      <p className="whitespace-pre-wrap">{issue.message}</p>
      <IssueStatus id={issue.id} status={issue.status} />
      <details className="text-sm text-stone-700"><summary className="cursor-pointer font-semibold">Report details</summary>
        <p className="mt-2 break-all">Page: {issue.page_url}</p><p>Week: {issue.current_week ?? '—'}</p><p>Screen: {issue.screen_size}</p><p>Device: {issue.device}</p><p className="break-all">Browser: {issue.browser}</p><p>Version: {issue.app_version}</p><p>User: {issue.user_id}</p>
        {issue.last_answer && <div className="mt-2"><strong>Last answer (shared by the user):</strong><p className="whitespace-pre-wrap">{issue.last_answer}</p></div>}
        {issue.type === 'broken' && !issue.email_sent_at && <p className="mt-2 text-amber-800">Admin email is waiting to send.</p>}
      </details>
      {issue.audio_path && <audio controls preload="none" src={`/api/issues/${issue.id}/attachment?kind=audio`} />}
      {issue.screenshot_path && <Link href={`/api/issues/${issue.id}/attachment?kind=screenshot`} target="_blank" className="block text-indigo-700 underline">Open screenshot</Link>}
    </article>)}
  </section>;
}
