import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Send only page metadata; never include report contents or learner identity. */
export async function sendIssueAlert(admin: SupabaseClient, id: string): Promise<boolean> {
  const { data: report, error: readError } = await admin.from('issue_reports')
    .select('page_url,created_at,current_week').eq('id', id).eq('type', 'broken').maybeSingle();
  if (readError || !report) {
    console.error('[issues] Could not load alert metadata:', readError?.message ?? 'report missing');
    return false;
  }

  let path = '(unknown page)';
  try { path = new URL(report.page_url).pathname || '/'; } catch { /* Older reports may have no page. */ }
  // Never allow header or body line injection. Query strings and fragments are excluded.
  path = path.replace(/[\r\n]/g, '').slice(0, 1024);
  const pageHash = createHash('sha256').update(path).digest('hex');
  const token = randomUUID();
  const { data: claim, error: claimError } = await admin.rpc('claim_issue_alert', { p_id: id, p_page_hash: pageHash, p_token: token });
  if (claimError) { console.error('[issues] Could not claim alert:', claimError.message); return false; }
  if (claim === 'grouped' || claim === 'done') return true;
  if (claim !== 'send') return false;

  let sent = false;
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.ISSUE_EMAIL_FROM;
    const to = process.env.ISSUE_ADMIN_EMAIL;
    const base = process.env.ISSUE_APP_URL;
    if (!apiKey || !from || !to || !base) {
      console.error('[issues] Email settings are missing; alert remains pending.');
      return false;
    }
    const url = new URL('/teacher?tab=issues', base).toString();
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.created_at));
    const week = report.current_week == null ? 'Unknown' : String(report.current_week);
    const response = await fetch('https://api.resend.com/emails', {
      signal: AbortSignal.timeout(5000), method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `issue/${id}` },
      body: JSON.stringify({ from, to: [to], subject: `[Fluency] Broken: ${path}`, text: `Page: ${path}\nTime (Europe/Madrid): ${time}\nWeek: ${week}\n\nView issues: ${url}` }),
    });
    if (!response.ok) { console.error('[issues] Email delivery failed:', response.status); return false; }
    sent = true;
  } catch (error) { console.error('[issues] Email delivery failed:', error); }
  finally {
    const { data, error } = await admin.rpc('finish_issue_alert', { p_id: id, p_page_hash: pageHash, p_token: token, p_sent: sent });
    if (error || !data) { console.error('[issues] Could not finish alert claim:', error?.message ?? 'claim lost'); sent = false; }
  }
  return sent;
}
