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
