/*
 * Service worker for Fluency Studio.
 *
 * Two rules decide everything here:
 *
 * 1. Precache only pages that exist and are public, plus static assets. The list
 *    used to include `/vocabulary` and `/checkpoints`; both are now 404, and
 *    `cache.addAll()` rejects the whole install if any single request fails, so
 *    the worker never installed at all.
 * 2. Never cache a signed-in page or a staff page. `/dashboard`, `/labs`,
 *    `/week/*`, `/review`, `/progress`, `/portfolio` and `/teacher` are rendered
 *    per learner or contain staff-only data; keeping them in a shared cache can
 *    show one person's page to another and serves stale HTML after a deploy. Only
 *    static assets and the public offline page are cached, and network-first is
 *    used for navigations so a deploy is picked up immediately.
 *
 * Bump CACHE_NAME whenever the precache list or the caching rules change: the
 * activate handler deletes every cache whose name is not the current one.
 */

const CACHE_NAME = 'fluency-studio-v2';

/** Public, static, and safe to serve from cache. Every entry must return 200. */
const PRECACHE_URLS = [
  '/offline',
  '/manifest.webmanifest',
  '/favicon.ico',
];

/** Same-origin static asset paths that may be cached at runtime. */
const STATIC_PREFIXES = ['/_next/static/', '/icons/', '/audio/', '/_next/image'];

/** Pages that must never enter a cache: per-learner or staff-only. */
const NEVER_CACHE_PATHS = [
  '/teacher',
  '/dashboard',
  '/labs',
  '/week',
  '/review',
  '/progress',
  '/portfolio',
  '/onboarding',
  '/login',
  '/auth',
  '/api',
];

function isStaticAsset(pathname) {
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return /\.(?:css|js|svg|png|jpg|jpeg|webp|woff2?|mp3|vtt)$/.test(pathname);
}

function isNeverCached(pathname) {
  return NEVER_CACHE_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Add one at a time and tolerate an individual miss: a single 404 must not
      // abort the install, and a missing optional asset is not worth a dead worker.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) await cache.put(url, response);
          } catch {
            /* Offline or the asset is absent: skip it and keep installing. */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: always try the network first, so a deploy is never masked by a
  // cached document, and fall back to the public offline page when it fails.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match('/offline');
        if (offline) return offline;
        return new Response('You are offline.', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }),
    );
    return;
  }

  if (isNeverCached(url.pathname) || !isStaticAsset(url.pathname)) return;

  // Static assets: cache-first with a background refresh.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) {
        event.waitUntil(
          fetch(request)
            .then((response) => (response.ok ? caches.open(CACHE_NAME).then((cache) => cache.put(request, response)) : undefined))
            .catch(() => undefined),
        );
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })(),
  );
});
