import test from 'node:test';
import assert from 'node:assert/strict';
import { sendIssueAlert } from '../../lib/issues/email.ts';

function fakeAdmin(report, action = 'send', finishResult = true) {
  const calls = [];
  const admin = {
    calls,
    from(table) {
      assert.equal(table, 'issue_reports');
      const query = {
        select(fields) { assert.equal(fields, 'page_url,created_at,current_week'); return query; },
        eq() { return query; },
        async maybeSingle() { return { data: report, error: null }; },
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: name === 'claim_issue_alert' ? action : finishResult, error: null };
    },
  };
  return admin;
}
const report = { page_url: 'https://example.com/labs?email=private@example.test#secret', created_at: '2025-07-01T10:30:00Z', current_week: 4, message: 'secret report', user_id: 'private-learner' };

test('email includes only page path, Madrid time, week and link', async () => {
  const saved = { ...process.env };
  const oldFetch = globalThis.fetch;
  try {
    Object.assign(process.env, { RESEND_API_KEY: 'test-key', ISSUE_EMAIL_FROM: 'sender@example.test', ISSUE_ADMIN_EMAIL: 'admin@example.test', ISSUE_APP_URL: 'https://example.com' });
    let payload;
    globalThis.fetch = async (_url, options) => { payload = JSON.parse(options.body); return { ok: true }; };
    const admin = fakeAdmin(report);
    assert.equal(await sendIssueAlert(admin, 'issue-1'), true);
    assert.equal(payload.subject, '[Fluency] Broken: /labs');
    assert.equal(payload.text, 'Page: /labs\nTime (Europe/Madrid): 1 Jul 2025, 12:30\nWeek: 4\n\nView issues: https://example.com/teacher?tab=issues');
    assert.doesNotMatch(JSON.stringify(payload), /private|secret|learner/);
    assert.equal(admin.calls[1].name, 'finish_issue_alert');
    assert.equal(admin.calls[1].args.p_sent, true);
    assert.equal(admin.calls[0].args.p_page_hash.length, 64);
  } finally { process.env = saved; globalThis.fetch = oldFetch; }
});

test('grouped, already-sent and leased alerts never send; failures release lease', async () => {
  const saved = { ...process.env }; const oldFetch = globalThis.fetch;
  try {
    Object.assign(process.env, { RESEND_API_KEY: 'key', ISSUE_EMAIL_FROM: 'from', ISSUE_ADMIN_EMAIL: 'to', ISSUE_APP_URL: 'https://example.com' });
    let fetches = 0;
    globalThis.fetch = async () => { fetches++; return { ok: false, status: 500 }; };
    for (const [action, expected] of [['grouped', true], ['done', true], ['pending', false]]) {
      const admin = fakeAdmin(report, action);
      assert.equal(await sendIssueAlert(admin, 'id'), expected);
      assert.equal(admin.calls.length, 1);
    }
    assert.equal(fetches, 0);
    const admin = fakeAdmin(report);
    assert.equal(await sendIssueAlert(admin, 'id'), false);
    assert.equal(fetches, 1);
    assert.equal(admin.calls[1].args.p_sent, false);
    assert.equal(admin.calls[0].args.p_token, admin.calls[1].args.p_token);
    const failedFinish = fakeAdmin(report, 'send', false);
    globalThis.fetch = async () => ({ ok: true });
    assert.equal(await sendIssueAlert(failedFinish, 'id'), false);
  } finally { process.env = saved; globalThis.fetch = oldFetch; }
});

test('missing configuration leaves claimed report pending and releases the lease', async () => {
  const saved = { ...process.env };
  try {
    delete process.env.RESEND_API_KEY;
    const admin = fakeAdmin(report);
    assert.equal(await sendIssueAlert(admin, 'id'), false);
    assert.equal(admin.calls[1].args.p_sent, false);
  } finally { process.env = saved; }
});
