import assert from 'node:assert/strict';
import test from 'node:test';
import { isExpectedCancelledRscPrefetch, isExpectedCancelledVisitRefresh } from '../e2e/helpers/request-failure-filter.mjs';

function request({ failure = 'net::ERR_ABORTED', url = 'http://127.0.0.1:3000/dashboard?_rsc=abc', navigation = false } = {}) {
  return {
    failure: () => ({ errorText: failure }),
    url: () => url,
    isNavigationRequest: () => navigation,
    method: () => 'POST',
  };
}

test('ignores only canceled non-navigation RSC prefetches', () => {
  assert.equal(isExpectedCancelledRscPrefetch(request()), true);
  assert.equal(isExpectedCancelledRscPrefetch(request({ navigation: true })), false);
  assert.equal(isExpectedCancelledRscPrefetch(request({ url: 'http://127.0.0.1:3000/dashboard' })), false);
  assert.equal(isExpectedCancelledRscPrefetch(request({ failure: 'net::ERR_CONNECTION_RESET' })), false);
  assert.equal(isExpectedCancelledRscPrefetch(request({ url: 'not a url' })), false);
});

test('ignores only canceled visit-refresh POSTs', () => {
  assert.equal(isExpectedCancelledVisitRefresh(request({ url: 'http://127.0.0.1:3000/api/week/refresh' })), true);
  assert.equal(isExpectedCancelledVisitRefresh(request({ navigation: true, url: 'http://127.0.0.1:3000/api/week/refresh' })), false);
  assert.equal(isExpectedCancelledVisitRefresh({ ...request({ url: 'http://127.0.0.1:3000/api/week/refresh' }), method: () => 'GET' }), false);
  assert.equal(isExpectedCancelledVisitRefresh(request({ url: 'http://127.0.0.1:3000/api/other' })), false);
  assert.equal(isExpectedCancelledVisitRefresh(request({ failure: 'net::ERR_CONNECTION_RESET', url: 'http://127.0.0.1:3000/api/week/refresh' })), false);
});
