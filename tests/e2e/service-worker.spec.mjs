import { expect, test } from '@playwright/test';

/**
 * The service worker used to fail to install.
 *
 * `install` ran `cache.addAll(['/', '/curriculum', '/vocabulary', '/checkpoints'])`.
 * `/vocabulary` and `/checkpoints` are 404, and `addAll` rejects the whole batch
 * if any request fails, so install rejected, the worker never activated, and
 * `navigator.serviceWorker.register()` resolved to a registration with no active
 * worker. Nothing surfaced except a console error.
 *
 * These tests register the worker exactly as the app does, wait for it to reach
 * `activated`, and inspect what it cached and what it refuses to cache.
 */

/** Register the worker and resolve once it is active, or reject with the reason. */
async function activateWorker(page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    if (!worker) throw new Error('no worker after register()');
    if (worker.state !== 'activated') {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`stuck in ${worker.state}`)), 20000);
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') {
            clearTimeout(timer);
            resolve();
          }
        });
      });
    }
    await navigator.serviceWorker.ready;
    return {
      state: registration.active?.state ?? null,
      scriptURL: registration.active?.scriptURL ?? null,
    };
  });
}

test('the service worker installs without errors and activates', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/offline');
  const registration = await activateWorker(page);
  expect(registration.state).toBe('activated');
  expect(registration.scriptURL).toContain('/sw.js');

  // No 404 from the precache, and no install failure in the console.
  expect(consoleErrors.filter((line) => /sw\.js|install|404|Failed to fetch/i.test(line))).toEqual([]);
});

test('only public pages and static assets are cached', async ({ page }) => {
  await page.goto('/offline');
  await activateWorker(page);

  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const entries = [];
    for (const key of keys) {
      const cache = await caches.open(key);
      for (const request of await cache.keys()) entries.push({ cache: key, url: new URL(request.url).pathname });
    }
    return { keys, entries };
  });

  // A version-suffixed cache name, so activate() can delete older ones.
  expect(cached.keys).toEqual([expect.stringMatching(/^fluency-studio-v\d+$/)]);
  expect(cached.keys[0]).not.toBe('fluency-studio-v1');

  const paths = cached.entries.map((entry) => entry.url);
  // The offline page is the only HTML that may be precached.
  expect(paths).toContain('/offline');
  // The 404 routes that broke install must not be requested again.
  for (const gone of ['/curriculum', '/vocabulary', '/checkpoints']) {
    expect(paths).not.toContain(gone);
  }
});

test('signed-in and teacher pages are never written to a cache', async ({ page }) => {
  await page.goto('/offline');
  await activateWorker(page);

  for (const path of ['/dashboard', '/week/1', '/labs', '/review', '/teacher']) {
    await page.goto(path);
  }
  // Give the fetch handler a moment to (not) cache anything.
  await page.waitForTimeout(500);

  const paths = await page.evaluate(async () => {
    const entries = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const request of await cache.keys()) entries.push(new URL(request.url).pathname);
    }
    return entries;
  });

  for (const path of ['/dashboard', '/week/1', '/teacher']) {
    expect(paths.some((entry) => entry === path || entry.startsWith(`${path}/`))).toBe(false);
  }
});

test('an old cache is deleted when the current one activates', async ({ page }) => {
  await page.goto('/offline');
  // Simulate a user who has the previous worker's cache on disk.
  await page.evaluate(() => caches.open('fluency-studio-v1').then((cache) => cache.put('/stale', new Response('old'))));

  await activateWorker(page);
  await page.waitForTimeout(300);

  const keys = await page.evaluate(() => caches.keys());
  expect(keys).not.toContain('fluency-studio-v1');
});
