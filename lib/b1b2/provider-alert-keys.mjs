/**
 * The grouping key for an AI failure alert, on its own so it can be tested.
 *
 * A hash rather than the raw endpoint: the key is stored in `ai_failure_alerts`
 * and sent as an HTTP header, and neither place needs to know which route the
 * deployment is failing on. Endpoint is part of the input, so one broken route
 * does not silence the alert for another.
 */
import { createHash } from 'node:crypto';

export function alertGroupKey(endpoint, kind) {
  return createHash('sha256').update(`${endpoint}|${kind}`).digest('hex');
}
