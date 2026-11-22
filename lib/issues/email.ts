import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Send no report contents or personal information by email. Resend deduplicates retries. */
export async function sendIssueAlert(admin: SupabaseClient, id: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ISSUE_EMAIL_FROM;
  const to = process.env.ISSUE_ADMIN_EMAIL;
  const base = process.env.ISSUE_APP_URL;
  if (!apiKey || !from || !to || !base) {
    console.error('[issues] Email settings are missing; alert remains pending.');
    return false;
  }
  try {
    const url = new URL('/teacher?tab=issues', base).toString();
    const response = await fetch('https://api.resend.com/emails', {
      signal: AbortSignal.timeout(5000), method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `issue/${id}` },
      body: JSON.stringify({ from, to: [to], subject: 'A new issue needs your attention', text: `A learner or teacher reported a broken feature.\n\nView issues: ${url}` }),
    });
    if (!response.ok) { console.error('[issues] Email delivery failed:', response.status); return false; }
    const { error } = await admin.from('issue_reports').update({ email_sent_at: new Date().toISOString() }).eq('id', id);
    if (error) { console.error('[issues] Could not mark alert sent:', error.message); return false; }
    return true;
  } catch (error) { console.error('[issues] Email delivery failed:', error); return false; }
}
