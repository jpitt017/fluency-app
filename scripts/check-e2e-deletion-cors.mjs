#!/usr/bin/env node
// Read-only preflight against the explicitly isolated E2E project. Browser
// database writes carry this custom header even before the fence is enabled;
// a gateway that does not allow it would break ordinary work during rollout.
import { pathToFileURL } from 'node:url';
import { E2E_PROJECT_URL } from './assert-e2e-supabase-target.mjs';

const ORIGIN = 'https://deletion-cors-check.example.invalid';
const REQUEST_HEADERS = ['authorization', 'apikey', 'content-type', 'x-client-info',
  'x-fluency-data-generation', 'prefer', 'accept-profile', 'content-profile'];
const csv = (value) => new Set((value ?? '').split(',').map((part) => part.trim().toLowerCase()).filter(Boolean));

export async function checkDeletionCors(projectUrl, fetchImpl = fetch) {
  if (projectUrl !== E2E_PROJECT_URL) throw new Error('Refusing CORS check outside the dedicated E2E project');
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const result = await fetchImpl(`${projectUrl}/rest/v1/profiles`, {
      method: 'OPTIONS', redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: { origin: ORIGIN, 'access-control-request-method': method,
        'access-control-request-headers': REQUEST_HEADERS.join(',') },
    });
    if (!result.ok) throw new Error(`E2E CORS preflight failed for ${method}: HTTP ${result.status}`);
    const origin = result.headers.get('access-control-allow-origin');
    if (origin !== '*' && origin !== ORIGIN) throw new Error('E2E CORS preflight did not allow the browser origin');
    const methods = csv(result.headers.get('access-control-allow-methods'));
    if (!methods.has(method.toLowerCase()) && !methods.has('*')) throw new Error(`E2E CORS preflight did not allow ${method}`);
    const allowed = csv(result.headers.get('access-control-allow-headers'));
    // Fetch treats Authorization as a non-wildcard request header, even if the
    // gateway returns '*'. The other requested headers may use the wildcard.
    if (!allowed.has('authorization') || REQUEST_HEADERS.some((name) => !allowed.has(name) && !allowed.has('*'))) {
      throw new Error('E2E CORS preflight did not allow all browser database headers');
    }
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkDeletionCors(process.env.E2E_SUPABASE_URL);
    console.log('PASS: isolated Supabase accepts the deletion-generation header for browser writes.');
  } catch (error) {
    console.error(`::error title=E2E deletion CORS::${error.message}`);
    process.exitCode = 1;
  }
}
