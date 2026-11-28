'use strict';

// Preloaded only by the isolated E2E jobs. The real app and database routes
// still run; only calls to the paid AI provider are replaced. A loopback-only
// base URL is a second fail-closed layer if the fetch hook is ever bypassed.
// Node's --require preload must be CommonJS and load before the SDK.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { appendFileSync } = require('node:fs');

const MOCK_ORIGIN = 'http://127.0.0.1:1';
const MOCK_KEY = 'e2e-mock-only';
const auditFile = process.env.E2E_AI_MOCK_AUDIT_FILE;
if (process.env.GROQ_BASE_URL !== MOCK_ORIGIN || !auditFile) {
  throw new Error('E2E AI mocking requires its loopback-only URL and audit file');
}
if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== MOCK_KEY) {
  throw new Error('A real AI provider key must never be used by E2E');
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch !== 'function') throw new Error('E2E AI mocking requires fetch');

function isLiveAiHost(hostname) {
  return ['groq.com', 'openai.com', 'anthropic.com'].some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

// Audit only the event type, never request bodies, paths, or credentials.
function record(event) {
  appendFileSync(auditFile, `${event}\n`);
}

globalThis.fetch = async function e2eMockAiFetch(input, init) {
  const raw = typeof input === 'string' || input instanceof URL ? input : input?.url;
  let url;
  try { url = new URL(raw); } catch { return originalFetch(input, init); }

  if (url.origin === MOCK_ORIGIN) {
    record('mock');
    return new Response(JSON.stringify({ error: { message: 'Synthetic E2E provider failure', type: 'mock_error' } }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
    });
  }
  if (isLiveAiHost(url.hostname)) {
    record('blocked');
    throw new Error('Live AI provider network access is blocked during E2E');
  }
  return originalFetch(input, init);
};
