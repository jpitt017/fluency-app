import { appendFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';
import { LIVE_PROJECT_REF } from '../../../scripts/assert-e2e-supabase-target.mjs';

export { expect };

const liveOrigin = `https://${LIVE_PROJECT_REF}.supabase.co`;
const aiDomains = ['groq.com', 'openai.com', 'anthropic.com'];

// Browser tests block and audit production Supabase and live AI-provider URLs.
// The app's server-side clients use the isolated E2E target and AI preload.
export const test = base.extend({
  page: async ({ page, context }, use, testInfo) => {
    const blockedRequests = [];
    const recordedRequests = new WeakSet();
    const recordBlockedRequest = (request) => {
      let url;
      try {
        url = new URL(request.url());
      } catch {
        return null;
      }
      const liveSupabase = url.origin === liveOrigin;
      const liveAi = aiDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
      if (!liveSupabase && !liveAi) return null;
      if (!recordedRequests.has(request)) {
        recordedRequests.add(request);
        blockedRequests.push(request);
        if (liveSupabase && process.env.E2E_NETWORK_AUDIT_FILE) {
          appendFileSync(process.env.E2E_NETWORK_AUDIT_FILE, `${JSON.stringify({
            test: testInfo.title, method: request.method(), origin: url.origin, pathname: url.pathname,
          })}\n`);
        }
        // Do not record AI URLs, headers, prompts or responses.
        if (liveAi && process.env.E2E_AI_MOCK_AUDIT_FILE) appendFileSync(process.env.E2E_AI_MOCK_AUDIT_FILE, 'blocked\n');
      }
      return url;
    };

    // Observe request events as well as routing, including requests originating
    // in service workers (which Playwright routing does not intercept).
    context.on('request', recordBlockedRequest);
    await context.route('**/*', async (route) => {
      const request = route.request();
      if (!recordBlockedRequest(request)) return route.continue();
      return route.abort('blockedbyclient');
    });

    // Playwright fixture's `use` callback is unrelated to React hooks.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    if (blockedRequests.length > 0) {
      throw new Error(`Blocked ${blockedRequests.length} browser request(s) to production Supabase or a live AI provider.`);
    }
  },
});
