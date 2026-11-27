// A browser keeps the generation that was current when a page/request began.
// It is not an authorization credential: row ownership is still enforced by
// Supabase RLS and the server verifies the signed-in user independently.
export const DELETION_EPOCH_COOKIE = 'fluency-data-generation';
export const DELETION_EPOCH_HEADER = 'x-fluency-data-generation';
export const DELETION_OWNER_HEADER = 'x-fluency-data-owner';
export const DELETION_TARGET_EPOCH_HEADER = 'x-fluency-target-generation';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseDeletionEpoch(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 2 || !UUID.test(parts[0]) || !UUID.test(parts[1])) return null;
  return { owner: parts[0].toLowerCase(), generation: parts[1].toLowerCase() };
}

export function formatDeletionEpoch(owner, generation) {
  const epoch = parseDeletionEpoch(`${owner}.${generation}`);
  return epoch ? `${epoch.owner}.${epoch.generation}` : null;
}

/** Pin at the start of a browser workflow, not after an awaited operation. */
export function browserDeletionGeneration(cookie) {
  if (cookie === undefined) {
    try { cookie = typeof document === 'undefined' ? '' : document.cookie; }
    catch { return 'missing'; }
  }
  if (typeof cookie !== 'string') return 'missing';
  const item = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${DELETION_EPOCH_COOKIE}=`));
  if (!item) return 'missing';
  try { return parseDeletionEpoch(decodeURIComponent(item.slice(DELETION_EPOCH_COOKIE.length + 1)))?.generation ?? 'missing'; }
  catch { return 'missing'; }
}

/** Add an epoch to direct browser database writes, but not auth/Storage calls.
 * An explicit header set at a workflow's start wins over a newer cookie. */
export function browserDeletionFetch(nextFetch, supabaseUrl, getCookie = () => document.cookie) {
  const restOrigin = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/`;
  return (input, init = {}) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!target.startsWith(restOrigin) || method === 'GET' || method === 'HEAD') return nextFetch(input, init);
    const outgoing = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!outgoing.has(DELETION_EPOCH_HEADER)) {
      let cookie = '';
      try { cookie = getCookie(); } catch { /* fail closed after a deletion */ }
      outgoing.set(DELETION_EPOCH_HEADER, browserDeletionGeneration(cookie));
    }
    return nextFetch(input, { ...init, headers: outgoing });
  };
}
