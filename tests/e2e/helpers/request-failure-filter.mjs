const ABORTED = 'net::ERR_ABORTED';

/** True only for a canceled, non-navigation React Server Component prefetch. */
export function isExpectedCancelledRscPrefetch(request) {
  if (request.failure()?.errorText !== ABORTED || request.isNavigationRequest()) return false;
  try {
    return new URL(request.url()).searchParams.has('_rsc');
  } catch {
    return false;
  }
}

/** The visit-refresh POST is fire-and-forget and may be canceled by fast SPA navigation. */
export function isExpectedCancelledVisitRefresh(request) {
  if (request.failure()?.errorText !== ABORTED || request.isNavigationRequest() || request.method() !== 'POST') return false;
  try {
    const url = new URL(request.url());
    return url.pathname === '/api/week/refresh';
  } catch {
    return false;
  }
}
