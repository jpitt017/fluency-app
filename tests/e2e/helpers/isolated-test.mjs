import { appendFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';
import { LIVE_PROJECT_REF } from '../../../scripts/assert-e2e-supabase-target.mjs';

export { expect };

const liveOrigin = `https://${LIVE_PROJECT_REF}.supabase.co`;

// Every browser test blocks and audits requests to the production Supabase host.
// The app's server-side and admin clients separately use only E2E_* settings.
export const test = base.extend({
  page: async ({ page, context }, use, testInfo) => {
    const blockedRequests = [];
    const recordedRequests = new WeakSet();
    const recordLiveRequest = (request) => {
      let url;
      try {
        url = new URL(request.url());
      } catch {
        return null;
      }
      if (url.origin !== liveOrigin) return null;
      if (!recordedRequests.has(request)) {
        const event = {
          test: testInfo.title,
          method: request.method(),
          origin: url.origin,
          pathname: url.pathname,
        };
        recordedRequests.add(request);
        blockedRequests.push(event);
        const auditFile = process.env.E2E_NETWORK_AUDIT_FILE;
        if (auditFile) appendFileSync(auditFile, `${JSON.stringify(event)}\n`);
      }
      return url;
    };

    // Observe request events as well as routing, including requests originating
    // in service workers (which Playwright routing does not intercept).
    context.on('request', recordLiveRequest);
    await context.route('**/*', async (route) => {
      const request = route.request();
      if (!recordLiveRequest(request)) return route.continue();
      return route.abort('blockedbyclient');
    });

    // Playwright fixture's `use` callback is unrelated to React hooks.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    if (blockedRequests.length > 0) {
      throw new Error(`Blocked ${blockedRequests.length} browser request(s) to the live Supabase project.`);
    }
  },
});
